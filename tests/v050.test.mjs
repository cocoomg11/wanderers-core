/* global game, JournalEntry, Folder */
/**
 * 0.5.0: health fix pass-through, the GM-only store (pure model, and createStore against core's shared fakes), the fakes themselves.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Core from "../src/index.mjs";
import * as Fnd from "../src/foundry/index.mjs";
import { healthCollector, readFix, healthLine, storableReport } from "../src/health-model.mjs";
import {
  defineStore, isStoreEntry, storeEntries, storeCreateData, needsFiling, storeGet, storeWith, storeWithKey, storeDeletions,
  deletionKeys, storeSize, STORE_FILED_FLAG
} from "../src/store-model.mjs";
import { createStore } from "../src/foundry/store.mjs";
import {
  fakeWorld, installFakes, actAs, fakeHooks, fakeSettings, applyUpdate, FakeApplicationV2, FAKE_DEL, OWNERSHIP, fakeCollection
} from "../src/testing/index.mjs";
import { RememberedWindow } from "../src/foundry/window.mjs";

/* ---- health fix ---- */

test("readFix: function, action id, object; bad ones are null", () => {
  const fn = () => "done";
  assert.deepEqual(readFix(fn), { label: "Fix", run: fn });
  assert.deepEqual(readFix("rebuild.index:1"), { label: "Fix", action: "rebuild.index:1" });
  assert.deepEqual(readFix({ label: "<b>Rebuild</b>", action: "rebuild", confirm: "Sure?" }), { label: "Rebuild", action: "rebuild", confirm: "Sure?" });
  assert.deepEqual(readFix({ label: "Run", run: fn, action: "x" }), { label: "Run", run: fn }, "run wins");
  assert.equal(readFix({ label: "x".repeat(99), action: "a" }).label.length, 60);
  assert.equal(readFix({ action: "a", confirm: "y".repeat(900) }).confirm.length, 500);
  assert.deepEqual(readFix({ action: "a", confirm: "  " }), { label: "Fix", action: "a" });
  for (const bad of [null, undefined, 5, "", "has space", "x".repeat(65), {}, { action: "bad id!" }, { run: "notfn" }]) assert.equal(readFix(bad), null, String(bad));
  const evil = { get action() { throw new Error("boom"); } };
  assert.equal(readFix(evil), null, "never throws");
});

test("collector keeps a line's fix; plain-text lines keep it too; storableReport drops functions", async () => {
  const run = () => "ok";
  const h = healthCollector({ timeoutMs: 50 });
  h.check(add => add("warn", "<i>Index</i> out of date", { label: "Rebuild", action: "rebuild" }));
  h.add("bad", "Broken", run);
  h.add("ok", "Fine");
  h.add("warn", "Bad fix ignored", { nope: 1 });
  await h.checkAsync("Async", async add => { add("warn", "Async fix", "fixIt"); });
  const r = h.report();
  assert.deepEqual(r[0].lines[0], { level: "warn", text: "Index out of date", fix: { label: "Rebuild", action: "rebuild" } });
  assert.equal(r[0].lines[1].fix.run, run);
  assert.equal("fix" in r[0].lines[2], false, "no fix: old shape");
  assert.equal("fix" in r[0].lines[3], false);
  assert.deepEqual(r[1].lines[0].fix, { label: "Fix", action: "fixIt" });
  r[0].lines[0].text = "changed";
  assert.equal(h.report()[0].lines[0].text, "Index out of date", "report() returns copies of the lines");

  assert.deepEqual(healthLine("error", "<p>Gone</p>", "fixIt"), { level: "bad", text: "Gone", fix: { label: "Fix", action: "fixIt" } });
  assert.deepEqual(healthLine("ok", "x"), { level: "ok", text: "x" });
  assert.equal(healthLine("ok", "  "), null);

  const s = storableReport(r);
  assert.deepEqual(s[0].lines[0].fix, { label: "Rebuild", action: "rebuild" });
  assert.equal("fix" in s[0].lines[1], false, "function-only fix dropped");
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s, "plain JSON");
  assert.equal(r[0].lines[1].fix.run, run, "the live report keeps its function");
  assert.deepEqual(storableReport(null), []);
});

/* ---- store model ---- */

const VAULT = { name: "Toolkit (GM only)", flagKey: "vault", entryFlag: "vaultEntry", version: 1, empty: () => ({ buckets: {} }), keysAt: "buckets", keys: ["quests", "pins", "migrations"] };

test("defineStore: defaults and mistakes", () => {
  const s = defineStore({ name: "Store" });
  assert.equal(s.flagKey, "store"); assert.equal(s.entryFlag, "storeEntry"); assert.equal(s.dataFolder, true); assert.equal(s.keysAt, null);
  assert.deepEqual(s.normalize(null), {}); assert.deepEqual(s.normalize([1]), {});
  assert.throws(() => defineStore({}), /name/);
  assert.throws(() => defineStore({ name: "x", flagKey: "a.b" }), /flagKey/);
  assert.throws(() => defineStore({ name: "x", entryFlag: "store" }), /entryFlag/);
  assert.throws(() => defineStore({ name: "x", entryFlag: STORE_FILED_FLAG }), /reserved/);
  assert.throws(() => defineStore({ name: "x", version: 1 }), /empty/);
  assert.throws(() => defineStore({ name: "x", maxBytes: 0 }), /maxBytes/);
  assert.throws(() => defineStore({ name: "x", keys: "a" }), /keys/);
  const v = defineStore(VAULT);
  assert.deepEqual(v.normalize(null), { v: 1, buckets: {} });
  assert.deepEqual(v.normalize({ buckets: { quests: {} } }), { v: 1, buckets: {} }, "an unversioned value without an upgrade step reads as empty");
  assert.deepEqual(v.normalize({ v: 1, buckets: { quests: {} } }), { v: 1, buckets: { quests: {} } });
});

test("finding entries: marker flag, or the data flag (Red Book style)", () => {
  const marker = defineStore({ name: "S", flagKey: "store", entryFlag: "storeEntry" });
  const byData = defineStore({ name: "S", flagKey: "store", entryFlag: null });
  const a = { id: "a", flags: { m: { storeEntry: true, store: { x: 1 } } } };
  const b = { id: "b", flags: { m: { store: { v: 1 } } } };
  const c = { id: "c", flags: { other: { storeEntry: true } } };
  const d = { id: "d", get flags() { throw new Error("x"); } };
  assert.equal(isStoreEntry(a, "m", marker), true); assert.equal(isStoreEntry(b, "m", marker), false);
  assert.equal(isStoreEntry(b, "m", byData), true); assert.equal(isStoreEntry(a, "m", byData), true);
  assert.equal(isStoreEntry(c, "m", marker), false); assert.equal(isStoreEntry(d, "m", marker), false);
  assert.deepEqual(storeEntries([a, b, c, d], "m", byData).map(e => e.id), ["a", "b"]);
  assert.deepEqual(storeEntries(null, "m", byData), []);
});

test("creation data: ownership none, flags, About escaped, folder marks it filed", () => {
  const s = defineStore({ name: "My (GM only)", about: "Keep <secret> GM only", flagKey: "vault", entryFlag: "vaultEntry", version: 1, empty: () => ({ buckets: {} }) });
  const d = storeCreateData("m", s, { none: 0, folder: "fold1" });
  assert.deepEqual(d.ownership, { default: 0 });
  assert.deepEqual(d.flags, { m: { vault: { v: 1, buckets: {} }, vaultEntry: true, [STORE_FILED_FLAG]: true } });
  assert.equal(d.folder, "fold1");
  assert.match(d.pages[0].text.content, /&lt;secret&gt;/);
  const e = storeCreateData("m", defineStore({ name: "x", entryFlag: null }));
  assert.equal(e.folder, undefined); assert.equal(e.pages, undefined); assert.deepEqual(e.flags, { m: { store: {} } });
  assert.equal(needsFiling({ flags: { m: {} } }, "m", s), true);
  assert.equal(needsFiling({ flags: { m: { [STORE_FILED_FLAG]: true } } }, "m", s), false);
  assert.equal(needsFiling({ flags: {} }, "m", defineStore({ name: "x", dataFolder: false })), false);
  assert.equal(needsFiling(null, "m", s), false);
});

test("keys: get, with, withKey; unknown keys throw; caps from the normalizer apply", () => {
  const s = defineStore({ ...VAULT, clean: v => ({ v: 1, buckets: Object.fromEntries(Object.entries(v.buckets ?? {}).filter(([k]) => VAULT.keys.includes(k))) }) });
  let d = s.normalize(null);
  d = storeWith(d, s, "quests", { a: 1 });
  assert.deepEqual(storeGet(d, s, "quests"), { a: 1 });
  assert.equal(storeGet(d, s, "pins", "none"), "none");
  assert.equal(storeGet(d, s, "toString", "none"), "none", "inherited names aren't keys");
  d = storeWithKey(d, s, "quests", "b", 2);
  assert.deepEqual(storeGet(d, s, "quests"), { a: 1, b: 2 });
  d = storeWithKey(d, s, "quests", "a", null);
  assert.deepEqual(storeGet(d, s, "quests"), { b: 2 });
  d = storeWith(d, s, "quests", undefined);
  assert.deepEqual(d, { v: 1, buckets: {} });
  assert.throws(() => storeWith(d, s, "nope", 1), /unknown key/);
  const flat = defineStore({ name: "x" });
  assert.deepEqual(storeWith({ a: 1 }, flat, "b", [1]), { a: 1, b: [1] });
});

test("deletions: removed keys down to the depth, both syntaxes", () => {
  const prev = { v: 1, buckets: { quests: { a: { x: 1, y: 2 }, b: {} }, pins: { p: 1 }, list: [1, 2] } };
  const next = { v: 1, buckets: { quests: { a: { x: 1 } }, list: [1] } };
  assert.deepEqual(storeDeletions(prev, next, "flags.m.vault").sort(), ["flags.m.vault.buckets.pins", "flags.m.vault.buckets.quests.b"], "default depth 3");
  assert.deepEqual(storeDeletions(prev, next, "flags.m.vault", 4).sort(), ["flags.m.vault.buckets.pins", "flags.m.vault.buckets.quests.a.y", "flags.m.vault.buckets.quests.b"]);
  assert.deepEqual(storeDeletions(prev, next, "f", 2), ["f.buckets.pins"]);
  assert.deepEqual(deletionKeys(["f.a.b"]), { "f.a.-=b": null });
  assert.deepEqual(deletionKeys(["f.a.b"], FAKE_DEL), { "f.a.b": FAKE_DEL });
  assert.deepEqual(storeDeletions(null, {}, "f"), []);
});

test("size guard", () => {
  const s = defineStore({ name: "x", maxBytes: 20 });
  assert.equal(storeSize({ a: 1 }, s).ok, true);
  assert.deepEqual(storeSize({ a: "x".repeat(30) }, s), { ok: false, bytes: 38, max: 20 });
});

/* ---- createStore against the shared fakes ---- */

let world, gm, gm2, player, restore;
beforeEach(() => {
  world = fakeWorld({ users: [{ id: "gm00000000000001", name: "GM", isGM: true }, { id: "gm00000000000002", name: "GM2", isGM: true, active: false }, { id: "pl00000000000001", name: "Pat" }] });
  [gm, gm2, player] = world.users.contents;
  restore = installFakes(world, gm);
});
afterEach(() => restore());

test("createStore: creates on first write in the Module data folder, reads, keyed sets, deletions really delete", async () => {
  const st = createStore("mod-a", { ...VAULT, about: "GM-only records." });
  assert.equal(st.entry(), null);
  assert.deepEqual(st.read(), { v: 1, buckets: {} });
  await st.set("quests", { q1: { name: "A" }, q2: { name: "B" } });
  const j = st.entry();
  assert.ok(j);
  assert.equal(j.name, "Toolkit (GM only)");
  assert.deepEqual(j.ownership, { default: OWNERSHIP.NONE });
  assert.equal(j.flags["mod-a"].vaultEntry, true);
  const folder = world.folders.contents[0];
  assert.equal(folder.name, "Module data"); assert.equal(j.folder, folder.id);
  assert.equal(j.pages.length, 1);
  await st.setKey("quests", "q1", null);
  assert.deepEqual(st.get("quests"), { q2: { name: "B" } }, "the removed key is gone from the stored flag (\"-=\" deletion)");
  assert.deepEqual(Object.keys(j.flags["mod-a"].vault.buckets.quests), ["q2"]);
  assert.equal(st.get("pins", "fb"), "fb");
  await assert.rejects(st.set("nope", 1), /unknown key/);
  assert.equal(world.journal.size, 1);
  const s = st.status();
  assert.equal(s.exists, true); assert.deepEqual(s.playersCanSee, []); assert.deepEqual(s.keys, ["quests"]); assert.ok(s.bytes > 0);
});

test("createStore: v14 deletion operator is used when present", async () => {
  restore(); restore = installFakes(world, gm, { deletionOperator: true });
  const st = createStore("mod-a", VAULT);
  await st.set("pins", { a: 1, b: 2 });
  await st.setKey("pins", "a", undefined);
  assert.deepEqual(st.get("pins"), { b: 2 });
});

test("createStore: concurrent updates are chained, nothing clobbered; one entry only", async () => {
  const st = createStore("mod-a", VAULT);
  await Promise.all(Array.from({ length: 10 }, (_, i) => st.setKey("quests", `q${i}`, { i })));
  assert.equal(Object.keys(st.get("quests")).length, 10);
  assert.equal(world.journal.size, 1);
  assert.equal(world.folders.size, 1);
  const fail = st.update(() => { throw new Error("bad fn"); });
  await assert.rejects(fail, /bad fn/);
  await st.setKey("quests", "after", 1);
  assert.equal(st.get("quests").after, 1, "the chain carries on after a failure");
  assert.deepEqual((await st.update(async d => ({ ...d, buckets: { ...d.buckets, pins: { z: 1 } } }))).buckets.pins, { z: 1 }, "async fn");
});

test("createStore: players never read or write; size limit refuses", async () => {
  const st = createStore("mod-a", { ...VAULT, maxBytes: 200 });
  await st.set("quests", { a: 1 });
  actAs(world, player);
  assert.equal(st.entry(), null);
  assert.deepEqual(st.read(), { v: 1, buckets: {} });
  assert.equal(st.get("quests", "fallback"), "fallback");
  await assert.rejects(st.set("quests", {}), /only a GM/);
  assert.equal(await st.remove(), 0);
  assert.equal(st.status().exists, false);
  actAs(world, gm);
  await assert.rejects(st.set("quests", { big: "x".repeat(500) }), /limit 200/);
  assert.deepEqual(st.get("quests"), { a: 1 }, "nothing written");
});

test("createStore: finds existing stores exactly as the modules do and files root-level ones once", async () => {
  // A Red Book style store (data flag only) and a Satchel style store (marker), both at the root, made before core 0.5.0.
  const rb = await JournalEntry.create({ name: "Old name", flags: { "red-book": { store: { v: 1, pins: [1] } } } });
  const ws = await JournalEntry.create({ name: "Satchel (GM only)", flags: { "wanderers-satchel": { storeEntry: true, store: { v: 1 } } } });
  const mine = await Folder.create({ name: "GM stuff", type: "JournalEntry" });
  const own = await JournalEntry.create({ name: "In GM folder", folder: mine.id, flags: { "mod-c": { storeEntry: true, store: {} } } });
  const R = createStore("red-book", { name: "Red Book data (GM only)", entryFlag: null });
  const W = createStore("wanderers-satchel", { name: "Satchel (GM only)" });
  const C = createStore("mod-c", { name: "C" });
  assert.equal(R.entry(), rb); assert.deepEqual(R.read(), { v: 1, pins: [1] });
  assert.equal(W.entry(), ws);
  assert.equal(await R.file(), true);
  assert.equal(await W.file(), true);
  assert.equal(await C.file(), false, "an entry in the GM's own folder stays there");
  assert.equal(own.folder, mine.id);
  assert.equal(own.flags["mod-c"].dataFolderFiled, true, "the GM's choice is recorded");
  const data = world.folders.find(f => f.name === "Module data");
  assert.equal(rb.folder, data.id); assert.equal(ws.folder, data.id);
  assert.equal(rb.name, "Old name", "nothing renamed");
  rb.folder = null; // the GM moves it back to the root: their choice is kept
  assert.equal(await R.file(), false); assert.equal(rb.folder, null);
  actAs(world, gm2); // not the active GM: no automatic filing
  const late = await JournalEntry.create({ name: "x", flags: { "mod-d": { storeEntry: true, store: {} } } });
  assert.equal(await createStore("mod-d", { name: "x" }).file(), false); assert.equal(late.folder, null);
  assert.equal(await createStore("mod-d", { name: "x", isWriter: () => true }).file(), true, "isWriter overrides");
});

test("createStore: a failed move is tried again later", async () => {
  const e = await JournalEntry.create({ name: "y", flags: { "mod-e": { storeEntry: true, store: {} } } });
  const realCreate = Folder.create;
  globalThis.Folder.create = async () => { throw new Error("no folders today"); };
  const E = createStore("mod-e", { name: "y", log: { warn: () => {} } });
  assert.equal(await E.file(), false);
  assert.equal(e.flags["mod-e"].dataFolderFiled, undefined);
  globalThis.Folder.create = realCreate;
  assert.equal(await E.file(), true);
  assert.equal(e.flags["mod-e"].dataFolderFiled, true);
  assert.equal(await E.file(), false, "once only");
});

test("createStore: remove deletes every copy and the folder only when empty", async () => {
  const A = createStore("mod-a", VAULT);
  const B = createStore("mod-b", { name: "B" });
  await A.set("quests", {}); await B.set("x", 1);
  await JournalEntry.create({ name: "dup", flags: { "mod-a": { vaultEntry: true, vault: {} } } });
  assert.equal(A.status().count, 2);
  assert.equal(await A.remove(), 2);
  assert.equal(A.entry(), null);
  assert.equal(world.folders.size, 1, "B's entry keeps the folder");
  assert.equal(await B.remove(), 1);
  assert.equal(world.folders.size, 0);
  assert.deepEqual(A.read(), { v: 1, buckets: {} });
});

test("createStore: refuses a bad definition at once", () => {
  assert.throws(() => createStore("", { name: "x" }), /module id/);
  assert.throws(() => createStore("m", {}), /name/);
});

/* ---- the fakes ---- */

test("fakes: hooks, settings, updates, collections, ApplicationV2, sockets", async () => {
  const H = fakeHooks();
  let n = 0;
  const id = H.on("x", v => { n += v; }); H.once("x", v => { n += v * 10; });
  H.callAll("x", 1); H.callAll("x", 1);
  assert.equal(n, 12); H.off("x", id); H.callAll("x", 1); assert.equal(n, 12);
  assert.equal(H.calls.length, 3);
  assert.equal(H.call("y"), true); H.on("y", () => false); assert.equal(H.call("y"), false);

  const S = fakeSettings();
  assert.throws(() => S.get("m", "a"), /not a registered/);
  let changed;
  S.register("m", "a", { default: { list: [] }, onChange: v => { changed = v; } });
  const v = S.get("m", "a"); v.list.push(1);
  assert.deepEqual(S.get("m", "a"), { list: [] }, "values are cloned");
  await S.set("m", "a", { list: [2] }); assert.deepEqual(changed, { list: [2] });

  const o = { flags: { m: { a: { b: 1, c: 2 } } } };
  applyUpdate(o, { "flags.m.a.-=b": null, "flags.m.d": 5, flags: { m: { a: { e: 3 } } } });
  assert.deepEqual(o, { flags: { m: { a: { c: 2, e: 3 }, d: 5 } } });
  applyUpdate(o, { "flags.m.d": FAKE_DEL }); assert.equal("d" in o.flags.m, false);

  const C = fakeCollection([{ id: "a", name: "A" }]);
  assert.equal(C.getName("A").id, "a"); assert.equal([...C].length, 1); assert.equal(C.contents.length, 1);

  const j = await JournalEntry.create({ name: "J", ownership: { default: 0, [player.id]: 2 } });
  assert.equal(j.testUserPermission(player, "OBSERVER"), true); assert.equal(j.testUserPermission(player, "OWNER"), false);
  await j.setFlag("m", "k", { a: 1 }); assert.deepEqual(j.getFlag("m", "k"), { a: 1 });
  await j.unsetFlag("m", "k"); assert.equal(j.getFlag("m", "k"), undefined);
  assert.equal(game.users.activeGM, gm);

  const got = [];
  game.socket.on("module.m", (msg, from) => got.push(["gm", msg, from]));
  const pg = actAs(world, player);
  pg.socket.emit("module.m", { a: 1 });
  assert.deepEqual(got, [["gm", { a: 1 }, player.id]], "delivered to the other client with the sender id");

  class Win extends FakeApplicationV2 { static DEFAULT_OPTIONS = { classes: ["w"], position: { width: 300 } }; }
  const w = new Win({ classes: ["x"] });
  assert.deepEqual(w.options.classes, ["w", "x"]); assert.equal(w.position.width, 300);
  await w.render(); await w.render(); assert.equal(w.renders, 2);
  // core's own mixin runs on the shared fake
  const R = RememberedWindow(FakeApplicationV2, { moduleId: "mod-w", key: "hub", saveMs: 1 });
  globalThis.innerWidth = 1200; globalThis.innerHeight = 900; globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
  const r = new R(); await r.render(); r.setPosition({ left: 200, top: 100 }); await new Promise(res => setTimeout(res, 5)); await r.close();
  assert.equal(game.settings.get("mod-w", "windowPlacement").windows.hub.left, 200);
});

test("exports and packaging: indexes, testing entry kept out of the runtime indexes", () => {
  for (const k of ["readFix", "healthLine", "storableReport", "defineStore", "storeDeletions", "storeRawData"]) assert.ok(k in Core, k);
  assert.ok("createStore" in Fnd);
  for (const k of ["fakeWorld", "FakeApplicationV2"]) { assert.ok(!(k in Core), k); assert.ok(!(k in Fnd), k); }
  const idx = readFileSync(new URL("../src/index.mjs", import.meta.url), "utf8") + readFileSync(new URL("../src/foundry/index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(idx, /testing/);
});
