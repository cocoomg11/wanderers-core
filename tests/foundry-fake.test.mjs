/**
 * The Foundry halves against a small fake `game` (not Foundry itself: these check our own wiring, such as namespacing, sender
 * checks and request routing; the real socket, settings and hooks still need a live world).
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createLeader } from "../src/foundry/leader.mjs";
import { createFeatures, createSettings, createLogger, settingValues } from "../src/foundry/module.mjs";
import { defineRequests } from "../src/socket-model.mjs";

/** A fake world: users, a socket bus that delivers to every other client with the sender's id, settings and hooks. */
function fakeWorld() {
  const listeners = [];
  const hooks = new Map();
  const users = new Map();
  const store = new Map(); const defs = new Map();
  const bus = {
    clients: [],
    // Delivers to every other client on the channel, running the listener as that client (its own `game`), with the sender's id.
    emit(from, channel, msg) {
      const before = globalThis.game;
      for (const l of listeners) if (l.client !== from && l.channel === channel) { globalThis.game = l.client.game; try { l.fn(structuredClone(msg), from.user.id); } finally { globalThis.game = before; } }
    }
  };
  const client = user => {
    const c = { user };
    c.game = {
      user,
      users: Object.assign(users, { contents: [...users.values()], activeGM: null }),
      socket: { on: (channel, fn) => listeners.push({ client: c, channel, fn }), off: () => {}, emit: (channel, msg) => bus.emit(c, channel, msg) },
      settings: {
        settings: defs,
        register: (ns, key, cfg) => defs.set(`${ns}.${key}`, { ...cfg, namespace: ns, key }),
        get: (ns, key) => { const d = defs.get(`${ns}.${key}`); if (!d) throw new Error("not registered"); return store.has(`${ns}.${key}`) ? store.get(`${ns}.${key}`) : d.default; },
        set: async (ns, key, v) => { store.set(`${ns}.${key}`, v); return v; }
      }
    };
    return c;
  };
  return { users, client, hooks, bus };
}
let W;
const as = c => { globalThis.game = c.game; };
beforeEach(() => {
  W = fakeWorld();
  globalThis.Hooks = { calls: [], callAll(n, p) { this.calls.push([n, p]); }, on: () => 1, off: () => {} };
  globalThis.ui = { notifications: { warns: [], warn(t) { this.warns.push(t); } } };
});

const gmUser = { id: "gm000000000000a1", name: "GM", isGM: true, active: true };
const player = { id: "pl000000000000b2", name: "Player", isGM: false, active: true };

test("requests route to the leader with Foundry's sender id; spoofed fields, bad kinds and repeats are dropped", async () => {
  W.users.set(gmUser.id, gmUser); W.users.set(player.id, player);
  const gmC = W.client(gmUser), plC = W.client(player);
  const requests = defineRequests({ note: { fields: { text: { type: "string", max: 50 } } }, gmOnly: { fields: {}, from: "gm" } });
  const got = [];
  as(gmC); const L = createLeader({ id: "mod-a", requests, settleMs: 0, heartbeatMs: 1e9 }); L.handle("note", (data, user) => got.push([data, user.id]));
  L.handle("gmOnly", (data, user) => got.push(["gm", user.id]));
  L.start();
  await L.settled();
  assert.equal(L.isLeader(), true);
  as(plC); const P = createLeader({ id: "mod-a", requests, settleMs: 0 }); P.start();
  assert.equal(P.isLeader(), false);
  as(plC); assert.equal(P.request("note", { text: "hello" }), true);
  as(plC); assert.equal(P.request("note", { text: 5 }), false, "the sender refuses bad data");
  as(plC); P.request("gmOnly", {});
  as(plC); plC.game.socket.emit("module.mod-a", { action: "request", kind: "note", rid: "same-rid-1", data: { text: "a" } });
  as(plC); plC.game.socket.emit("module.mod-a", { action: "request", kind: "note", rid: "same-rid-1", data: { text: "a" } });
  as(plC); plC.game.socket.emit("module.mod-a", { action: "request", kind: "note", rid: "spoof-rid-2", data: { text: "b", userId: gmUser.id } });
  as(plC); plC.game.socket.emit("module.mod-a", { action: "request", kind: "evil", rid: "evil-rid-3", data: {} });
  as(gmC); await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(got, [[{ text: "hello" }, player.id], [{ text: "a" }, player.id]]);
  L.stop(); P.stop();
});

test("two modules with different core copies never hear each other", async () => {
  W.users.set(gmUser.id, gmUser); W.users.set(player.id, player);
  const gmC = W.client(gmUser), plC = W.client(player);
  const reqs = defineRequests({ ping: { fields: {} } });
  const heard = { a: 0, b: 0 };
  as(gmC);
  const A = createLeader({ id: "mod-a", requests: reqs, settleMs: 0, heartbeatMs: 1e9 }); A.handle("ping", () => heard.a++); A.start();
  const B = createLeader({ id: "mod-b", requests: reqs, settleMs: 0, heartbeatMs: 1e9 }); B.handle("ping", () => heard.b++); B.start();
  await A.settled(); await B.settled();
  as(plC); const PA = createLeader({ id: "mod-a", requests: reqs }); PA.start(); PA.request("ping");
  as(gmC); await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(heard, { a: 1, b: 0 });
  assert.throws(() => A.broadcastHook("mod-b.something"), /isn't one of this module's broadcast hooks/);
  assert.throws(() => A.handle("unknown", () => {}), /no request schema/);
  assert.throws(() => createLeader({ id: "" }));
  A.stop(); B.stop(); PA.stop();
});

test("two tabs of one GM user: only the earliest leads; a player's session message is ignored", async () => {
  W.users.set(gmUser.id, gmUser); W.users.set(player.id, player);
  const tab1 = W.client(gmUser), tab2 = W.client(gmUser), plC = W.client(player);
  as(tab1); const L1 = createLeader({ id: "mod-a", settleMs: 5, heartbeatMs: 1e9 }); L1.start();
  await new Promise(r => setTimeout(r, 2));
  as(tab2); const L2 = createLeader({ id: "mod-a", settleMs: 5, heartbeatMs: 1e9 }); L2.start();
  as(plC); plC.game.socket.emit("module.mod-a", { action: "leader", op: "ping", sid: "AAAAplayer", since: -1 });
  await L1.settled(); await L2.settled();
  as(tab1); assert.equal(L1.isLeader(), true);
  as(tab2); assert.equal(L2.isLeader(), false); assert.equal(L2.info().sessions, 2);
  as(tab1); L1.stop();
  as(tab2); assert.equal(L2.isLeader(), true, "bye hands over");
  L2.stop();
});

test("features, settings and logger are bound to the module's own namespace", () => {
  W.users.set(gmUser.id, gmUser);
  as(W.client(gmUser));
  const F = createFeatures("mod-a", [{ id: "tool", label: "Tool" }, { id: "other", label: "Other", needs: ["tool"] }], { title: "Mod A" });
  const S = createSettings("mod-a", [{ key: "debugLog", type: "bool", default: false, label: "Debug logging" }, { key: "n", type: "number", default: 2, min: 1, max: 3 }], { reserved: F.FEATURES.map(f => f.key) });
  F.register(); S.register();
  assert.ok(globalThis.game.settings.settings.has("mod-a.feature-tool"));
  assert.equal(globalThis.game.settings.settings.get("mod-a.n").type, Number);
  assert.equal(globalThis.game.settings.settings.get("mod-a.feature-tool").requiresReload, true);
  globalThis.game.settings.set("mod-a", "feature-tool", false);
  assert.equal(F.on("other"), false); assert.equal(F.need("other"), false);
  assert.match(globalThis.ui.notifications.warns[0], /Other is turned off in Mod A › Features/);
  assert.deepEqual(settingValues("mod-a").map(s => s.key).sort(), ["debugLog", "feature-other", "feature-tool", "n"]);
  assert.deepEqual(settingValues("mod-b"), []);
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a);
  try { const Lg = createLogger("mod-a"); Lg.log("hidden"); globalThis.game.settings.set("mod-a", "debugLog", true); Lg.log("shown"); } finally { console.log = orig; }
  assert.deepEqual(logs, [["mod-a [debug] |", "shown"]]);
});
