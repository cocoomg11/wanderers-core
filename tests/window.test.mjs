import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as Core from "../src/index.mjs";
import * as CoreF from "../src/foundry/index.mjs";
import {
  PLACEMENT_MAX, PLACEMENT_MIN_SIZE, isWindowKey, readPlacement, readPlacements, getPlacement, setPlacement, removePlacement,
  samePlacement, clampPlacement, placementOf, debouncer
} from "../src/window-model.mjs";
import { defineOpenKeybinding, keybindingConfig } from "../src/keybinding-model.mjs";
import { RememberedWindow, registerWindowPlacement, resetPlacement, savedPlacement } from "../src/foundry/window.mjs";
import { registerOpenKeybinding } from "../src/foundry/keybinding.mjs";

test("window and keybinding helpers are exported", () => {
  for (const n of ["readPlacements", "clampPlacement", "setPlacement", "removePlacement", "debouncer", "PLACEMENT_SETTING", "defineOpenKeybinding", "keybindingConfig"]) assert.ok(n in Core, n);
  for (const n of ["RememberedWindow", "registerWindowPlacement", "resetPlacement", "savedPlacement", "registerOpenKeybinding"]) assert.ok(n in CoreF, n);
  assert.equal(Core.PLACEMENT_SETTING, "windowPlacement");
});

test("window keys are safe object keys", () => {
  for (const k of ["hub", "sheet.abc123", "a-b_c", "0x"]) assert.ok(isWindowKey(k), k);
  for (const k of ["", ".x", "a b", "__proto__", "constructor", "x".repeat(65), 5, null]) assert.ok(!isWindowKey(k), String(k));
});

test("readPlacement cleans values and refuses unusable ones", () => {
  assert.deepEqual(readPlacement({ left: 10.4, top: 20.6, width: 500, height: "auto", minimized: "yes" }), { left: 10, top: 21, width: 500 });
  assert.deepEqual(readPlacement({ left: 0, top: 0, width: 5, height: 0, minimized: true }), { left: 0, top: 0, width: PLACEMENT_MIN_SIZE, minimized: true });
  for (const bad of [null, "x", [], { left: 1 }, { left: NaN, top: 1 }, { left: Infinity, top: 0 }, { left: "1", top: 2 }]) assert.equal(readPlacement(bad), null);
});

test("readPlacements never throws, drops bad entries, caps, and empties newer versions", () => {
  assert.deepEqual(readPlacements(undefined), { v: 1, windows: {} });
  assert.deepEqual(readPlacements("junk"), { v: 1, windows: {} });
  assert.deepEqual(readPlacements({ v: 1, windows: [] }), { v: 1, windows: {} });
  assert.deepEqual(readPlacements({ v: 99, windows: { a: { left: 1, top: 1 } } }), { v: 1, windows: {} });
  const raw = JSON.parse('{"windows":{"ok":{"left":1,"top":2},"bad key":{"left":1,"top":2},"__proto__":{"left":1,"top":2},"nope":{"left":"x"}}}');
  const s = readPlacements(raw);
  assert.deepEqual(s, { v: 1, windows: { ok: { left: 1, top: 2 } } });
  assert.equal(Object.getPrototypeOf(s.windows), Object.prototype);
  const many = { v: 1, windows: Object.fromEntries(Array.from({ length: PLACEMENT_MAX + 5 }, (_, i) => [`w${i}`, { left: i, top: i }])) };
  const capped = readPlacements(many);
  assert.equal(Object.keys(capped.windows).length, PLACEMENT_MAX);
  assert.ok(!("w0" in capped.windows) && `w${PLACEMENT_MAX + 4}` in capped.windows, "the oldest are dropped");
});

test("set, get and remove return new stores; the latest save is kept by the cap", () => {
  const empty = readPlacements(null);
  let s = setPlacement(empty, "hub", { left: 5, top: 6, width: 700, height: 500 });
  assert.deepEqual(empty.windows, {}, "the input isn't changed");
  assert.deepEqual(getPlacement(s, "hub"), { left: 5, top: 6, width: 700, height: 500 });
  assert.equal(getPlacement(s, "other"), null); assert.equal(getPlacement(s, "__proto__"), null);
  s = setPlacement(s, "log", { left: 1, top: 1 });
  s = setPlacement(s, "hub", { left: 9, top: 9 });
  assert.deepEqual(Object.keys(s.windows), ["log", "hub"], "a saved window moves to the end");
  assert.throws(() => setPlacement(s, "bad key", { left: 1, top: 1 }), /bad window key/);
  assert.deepEqual(Object.keys(setPlacement(s, "hub", { left: "x" }).windows), ["log"], "an unreadable placement removes it");
  assert.deepEqual(Object.keys(removePlacement(s, "log").windows), ["hub"]);
  assert.deepEqual(removePlacement(s), { v: 1, windows: {} });
  let full = readPlacements(null);
  for (let i = 0; i < PLACEMENT_MAX; i++) full = setPlacement(full, `w${i}`, { left: i, top: i });
  full = setPlacement(full, "w0", { left: 1, top: 1 });
  full = setPlacement(full, "new", { left: 1, top: 1 });
  assert.ok("w0" in full.windows && "new" in full.windows && !("w1" in full.windows));
});

test("samePlacement and placementOf", () => {
  assert.ok(samePlacement({ left: 1.2, top: 2 }, { left: 1, top: 2 }));
  assert.ok(!samePlacement({ left: 1, top: 2 }, { left: 1, top: 2, minimized: true }));
  assert.ok(!samePlacement(null, { left: 1, top: 2 })); assert.ok(samePlacement(null, undefined));
  assert.deepEqual(placementOf({ left: 3, top: 4, width: 600, height: "auto", scale: 1, zIndex: 100 }), { left: 3, top: 4, width: 600 });
  assert.deepEqual(placementOf({ left: 3, top: 4, width: 600, height: 400 }, { size: false, minimized: true }), { left: 3, top: 4, minimized: true });
  assert.equal(placementOf(null), null);
});

test("clampPlacement keeps windows on screen, shrinks to fit and honours the UI scale", () => {
  const vp = { width: 1000, height: 800 };
  assert.deepEqual(clampPlacement({ left: 100, top: 100, width: 400, height: 300 }, vp), { left: 100, top: 100, width: 400, height: 300 });
  assert.deepEqual(clampPlacement({ left: 900, top: 700, width: 400, height: 300 }, vp), { left: 600, top: 500, width: 400, height: 300 });
  assert.deepEqual(clampPlacement({ left: -50, top: -10, width: 400, height: 300 }, vp), { left: 0, top: 0, width: 400, height: 300 });
  assert.deepEqual(clampPlacement({ left: 50, top: 50, width: 3000, height: 2000 }, vp), { left: 0, top: 0, width: 1000, height: 800 });
  assert.deepEqual(clampPlacement({ left: 900, top: 700, width: 400, height: 300 }, vp, { scale: 2 }), { left: 200, top: 200, width: 400, height: 300 });
  assert.deepEqual(clampPlacement({ left: 0, top: 0, width: 800, height: 600 }, vp, { scale: 2 }), { left: 0, top: 0, width: 500, height: 400 });
  assert.deepEqual(clampPlacement({ left: 2000, top: 2000 }, vp), { left: 1000, top: 800 }, "no size known: only the corner stays on screen");
  assert.deepEqual(clampPlacement({ left: 2000, top: 2000 }, vp, { size: { width: 300, height: "auto" } }), { left: 700, top: 800 });
  assert.deepEqual(clampPlacement({ left: 0, top: 0, width: 400, height: 300 }, { width: 100, height: 90 }), { left: 0, top: 0, width: 100, height: 90 }, "a tiny page beats the minimum size");
  assert.deepEqual(clampPlacement({ left: 5, top: 5, width: 50 }, { width: NaN, height: 1 }), { left: 5, top: 5, width: PLACEMENT_MIN_SIZE });
  assert.equal(clampPlacement({ left: "x" }, vp), null);
  assert.deepEqual(clampPlacement({ left: 10, top: 10, minimized: true }, vp), { left: 10, top: 10, minimized: true });
});

test("debouncer runs once after the last call, and flush/cancel work", () => {
  const timers = new Map(); let n = 0, runs = 0;
  const t = { set: (fn) => { timers.set(++n, fn); return n; }, clear: id => timers.delete(id) };
  const d = debouncer(() => runs++, 100, t);
  d.call(); d.call(); d.call();
  assert.equal(timers.size, 1); assert.ok(d.pending());
  [...timers.values()][0](); assert.equal(runs, 1); assert.ok(!d.pending());
  d.call(); d.flush(); assert.equal(runs, 2); assert.equal(timers.size, 1, "flush cleared the timer (the old fired one stays in the fake)");
  d.flush(); assert.equal(runs, 2, "nothing pending, nothing runs");
  d.call(); d.cancel(); assert.ok(!d.pending()); assert.equal(runs, 2);
});

test("defineOpenKeybinding checks the definition; no key by default", () => {
  const onDown = () => {};
  const d = defineOpenKeybinding({ action: "openHub", name: "Open the hub", onDown });
  assert.deepEqual({ ...d }, { action: "openHub", name: "Open the hub", hint: "", gmOnly: false, editable: [], onDown });
  assert.ok(Object.isFrozen(d));
  const k = defineOpenKeybinding({ action: "openLog", name: "Log", onDown, gmOnly: true, precedence: 1, editable: [{ key: "KeyL", modifiers: ["Shift", "Control"] }, { key: "F7" }] });
  assert.deepEqual(k.editable, [{ key: "KeyL", modifiers: ["Control", "Shift"] }, { key: "F7", modifiers: [] }]);
  assert.equal(k.precedence, 1);
  const bad = [
    [{ name: "x", onDown }, /action id/], [{ action: "1x", name: "x", onDown }, /action id/], [{ action: "a", onDown }, /name/],
    [{ action: "a", name: " ", onDown }, /name/], [{ action: "a", name: "x" }, /onDown/], [{ action: "a", name: "x", onDown, gmOnly: 1 }, /gmOnly/],
    [{ action: "a", name: "x", onDown, editable: "KeyB" }, /editable/], [{ action: "a", name: "x", onDown, editable: [{ key: "b c" }] }, /bad key/],
    [{ action: "a", name: "x", onDown, editable: [{ key: "KeyB", modifiers: ["Meta"] }] }, /unknown modifier/],
    [{ action: "a", name: "x", onDown, editable: [{ key: "KeyB", modifiers: ["Shift"] }, { key: "KeyB", modifiers: ["Shift"] }] }, /twice/],
    [{ action: "a", name: "x", onDown, precedence: 1.5 }, /precedence/], [{ action: "a", name: "x", onDown, hint: 3 }, /hint/]
  ];
  for (const [spec, re] of bad) assert.throws(() => defineOpenKeybinding(spec), re, JSON.stringify(spec));
  assert.throws(() => defineOpenKeybinding(null), /object/);
});

test("keybindingConfig maps gmOnly to restricted, guards players, and never lets errors escape", async () => {
  const errors = []; let ran = 0;
  const def = defineOpenKeybinding({ action: "a", name: "A", hint: "h", gmOnly: true, editable: [{ key: "KeyA" }], onDown: () => { ran++; } });
  let gm = false;
  const cfg = keybindingConfig(def, { isGM: () => gm, onError: e => errors.push(e) });
  assert.equal(cfg.restricted, true); assert.equal(cfg.name, "A"); assert.equal(cfg.hint, "h"); assert.ok(!("precedence" in cfg));
  assert.deepEqual(cfg.editable, [{ key: "KeyA", modifiers: [] }]);
  cfg.editable[0].modifiers.push("Shift"); assert.deepEqual(def.editable[0].modifiers, [], "Foundry's copy is separate");
  assert.equal(cfg.onDown({}), false); assert.equal(ran, 0);
  gm = true; assert.equal(cfg.onDown({}), true); assert.equal(ran, 1);
  const boom = keybindingConfig(defineOpenKeybinding({ action: "b", name: "B", onDown: () => { throw new Error("x"); } }), { isGM: () => false, onError: e => errors.push(e) });
  assert.equal(boom.restricted, false); assert.equal(boom.onDown({}), true);
  const rej = keybindingConfig(defineOpenKeybinding({ action: "c", name: "C", onDown: () => Promise.reject(new Error("y")) }), { isGM: () => false, onError: e => errors.push(e) });
  assert.equal(rej.onDown({}), true);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(errors.map(e => e.message), ["x", "y"]);
});

/* ---- Foundry halves against fakes (wiring only, not Foundry) ---- */

let store, defs, hooks, listeners, kb;
beforeEach(() => {
  store = new Map(); defs = new Map(); hooks = []; listeners = []; kb = [];
  globalThis.game = {
    user: { isGM: false },
    settings: {
      settings: defs,
      register: (ns, key, cfg) => defs.set(`${ns}.${key}`, { ...cfg, namespace: ns, key }),
      get: (ns, key) => { const d = defs.get(`${ns}.${key}`); if (!d) throw new Error("not registered"); return store.has(`${ns}.${key}`) ? structuredClone(store.get(`${ns}.${key}`)) : d.default; },
      set: async (ns, key, v) => { store.set(`${ns}.${key}`, structuredClone(v)); return v; }
    },
    keybindings: { register: (ns, action, cfg) => kb.push([ns, action, cfg]) }
  };
  globalThis.Hooks = { on: (n, fn) => { hooks.push([n, fn]); return hooks.length; }, off: (n, id) => { hooks[id - 1] = null; } };
  globalThis.innerWidth = 1200; globalThis.innerHeight = 900;
  globalThis.addEventListener = (n, fn) => listeners.push([n, fn]);
  globalThis.removeEventListener = (n, fn) => { listeners = listeners.filter(l => l[1] !== fn); };
});

/** A tiny stand-in for ApplicationV2's documented lifecycle (constructor calls _initializeApplicationOptions; setPosition → _onPosition). */
class FakeApp {
  static DEFAULT_OPTIONS = { position: { width: 600, height: "auto" } };
  constructor(options = {}) { this.options = this._initializeApplicationOptions(options); this.position = { left: 50, top: 50, scale: 1, ...this.options.position }; this.rendered = false; this.minimized = false; }
  _initializeApplicationOptions(options) { return { ...options, position: { ...FakeApp.DEFAULT_OPTIONS.position, ...(options.position ?? {}) } }; }
  async render() { const first = !this.rendered; this.rendered = true; if (first) await this._onFirstRender({}, {}); return this; }
  async _onFirstRender() {}
  setPosition(p) { Object.assign(this.position, p); this._onPosition(this.position); return this.position; }
  _onPosition() {}
  async minimize() { this.minimized = true; }
  async maximize() { this.minimized = false; }
  async close() { this.rendered = false; this._onClose({}); }
  _onClose() {}
}
const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));

test("RememberedWindow refuses bad options", () => {
  assert.throws(() => RememberedWindow(null, { moduleId: "m", key: "hub" }), /Base/);
  assert.throws(() => RememberedWindow(FakeApp, { key: "hub" }), /moduleId/);
  assert.throws(() => RememberedWindow(FakeApp, { moduleId: "m", key: "bad key" }), /bad window key/);
});

test("RememberedWindow saves moves (debounced) in the module's own client setting and restores them clamped", async () => {
  const Hub = RememberedWindow(FakeApp, { moduleId: "mod-a", key: "hub", saveMs: 1 });
  let a = new Hub();
  assert.equal(defs.get("mod-a.windowPlacement").scope, "client");
  assert.equal(defs.get("mod-a.windowPlacement").config, false);
  assert.equal(a.position.left, 50, "nothing saved yet: the default position");
  a.setPosition({ left: 999 }); await tick();
  assert.equal(store.size, 0, "moves before the first render aren't saved");
  await a.render();
  a.setPosition({ left: 300, top: 200, width: 640, height: 480 }); a.setPosition({ left: 310 });
  await tick();
  assert.deepEqual(store.get("mod-a.windowPlacement"), { v: 1, windows: { hub: { left: 310, top: 200, width: 640, height: 480 } } });
  assert.deepEqual(savedPlacement("mod-a", "hub"), { left: 310, top: 200, width: 640, height: 480 });
  await a.close();
  a = new Hub();
  assert.deepEqual([a.position.left, a.position.top, a.position.width, a.position.height], [310, 200, 640, 480]);
  globalThis.innerWidth = 700; globalThis.innerHeight = 500;
  const b = new Hub();
  assert.deepEqual([b.position.left, b.position.top, b.position.width, b.position.height], [60, 20, 640, 480], "clamped to a smaller page");
  assert.equal(store.get("mod-a.windowPlacement").windows.hub.left, 310, "clamping on open doesn't overwrite the saved value");
  assert.ok(![...defs.keys()].some(k => !k.startsWith("mod-a.")), "nothing outside the module's namespace");
});

test("a window that sets its own position keeps it; resize re-clamps without saving; reset forgets", async () => {
  store.set("mod-a.windowPlacement", { v: 1, windows: { hub: { left: 900, top: 600, width: 300, height: 200 } } });
  const Hub = RememberedWindow(FakeApp, { moduleId: "mod-a", key: "hub", saveMs: 1 });
  const own = new Hub({ position: { left: 10 } });
  assert.equal(own.position.left, 10); assert.equal(own.position.width, 600);
  const a = new Hub(); await a.render();
  assert.equal(listeners.filter(l => l[0] === "resize").length, 1);
  assert.ok(hooks.some(h => h?.[0] === "clientSettingChanged"));
  globalThis.innerWidth = 800; globalThis.innerHeight = 500;
  listeners.find(l => l[0] === "resize")[1](); await tick();
  assert.deepEqual([a.position.left, a.position.top], [500, 300]);
  assert.equal(store.get("mod-a.windowPlacement").windows.hub.left, 900, "re-clamping isn't saved");
  await a.close();
  assert.equal(listeners.length, 0, "listeners removed on close"); assert.ok(!hooks.some(h => h?.[0] === "clientSettingChanged"));
  store.set("mod-a.windowPlacement", { v: 1, windows: { hub: { left: 1, top: 1 }, log: { left: 2, top: 2 } } });
  await resetPlacement("mod-a", "hub");
  assert.deepEqual(Object.keys(store.get("mod-a.windowPlacement").windows), ["log"]);
  await resetPlacement("mod-a");
  assert.deepEqual(store.get("mod-a.windowPlacement").windows, {});
});

test("minimized state is saved (keeping the full size) and restored; size: false and key functions", async () => {
  const Hub = RememberedWindow(FakeApp, { moduleId: "mod-a", key: "hub", saveMs: 1 });
  const a = new Hub(); await a.render();
  a.setPosition({ left: 100, top: 100, width: 500, height: 400 }); await tick();
  await a.minimize(); a.setPosition({ height: 30 }); await tick();
  assert.deepEqual(store.get("mod-a.windowPlacement").windows.hub, { left: 100, top: 100, width: 500, height: 400, minimized: true });
  await a.close();
  const b = new Hub(); assert.equal(b.position.height, 400); await b.render();
  assert.equal(b.minimized, true, "opens minimized again");
  await b.maximize(); await tick();
  assert.equal(store.get("mod-a.windowPlacement").windows.hub.minimized, undefined);

  const Sheet = RememberedWindow(FakeApp, { moduleId: "mod-b", key: o => `sheet.${o.docId}`, size: false, saveMs: 1 });
  const s = new Sheet({ docId: "abc" }); await s.render();
  assert.equal(s.placementKey, "sheet.abc");
  s.setPosition({ left: 70, top: 80, width: 900 }); await tick();
  assert.deepEqual(store.get("mod-b.windowPlacement").windows, { "sheet.abc": { left: 70, top: 80 } });
  const n = new Sheet({ docId: "bad id!" }); await n.render(); n.setPosition({ left: 1 }); await tick();
  assert.equal(n.placementKey, null); assert.deepEqual(Object.keys(store.get("mod-b.windowPlacement").windows), ["sheet.abc"], "no key: nothing saved");
});

test("registerWindowPlacement is idempotent; registerOpenKeybinding registers in the module's namespace", () => {
  registerWindowPlacement("mod-c"); registerWindowPlacement("mod-c");
  assert.equal([...defs.keys()].filter(k => k === "mod-c.windowPlacement").length, 1);
  assert.throws(() => registerWindowPlacement(""), /module id/);
  let opened = 0;
  const def = registerOpenKeybinding({ moduleId: "mod-c", action: "openHub", name: "Open hub", hint: "Opens it", gmOnly: true, onDown: () => { opened++; } });
  assert.equal(def.action, "openHub");
  assert.equal(kb.length, 1);
  const [ns, action, cfg] = kb[0];
  assert.equal(ns, "mod-c"); assert.equal(action, "openHub");
  assert.deepEqual(cfg.editable, [], "no default key"); assert.equal(cfg.restricted, true);
  assert.equal(cfg.onDown({}), false); globalThis.game.user.isGM = true; assert.equal(cfg.onDown({}), true); assert.equal(opened, 1);
  assert.throws(() => registerOpenKeybinding({ action: "x", name: "x", onDown() {} }), /moduleId/);
  assert.throws(() => registerOpenKeybinding({ moduleId: "m", action: "x", onDown() {} }), /name/);
});
