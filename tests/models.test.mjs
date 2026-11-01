import { test } from "node:test";
import assert from "node:assert/strict";
import { defineFeatures, isOn, allOn, splitNeeds } from "../src/features-model.mjs";
import { defineSettings, tabRows, convert, records, registration, scopeOf } from "../src/settings-model.mjs";
import { healthCollector, worst, counts, level } from "../src/health-model.mjs";
import { confirmed, hasFlags, dryRun, picked, changedSettings, summary } from "../src/cleanup-model.mjs";
import { buildExport, readImport, checkValue, preview, fileName } from "../src/settings-io-model.mjs";
import { decide, entriesBetween, buildNotice, lintNotes } from "../src/notes-model.mjs";

const FEATURES = defineFeatures([
  { id: "travel", label: "Travel" },
  { id: "map", label: "Map", needs: ["travel"] },
  { id: "extra", label: "Extra", default: false },
  { id: "legacy", label: "Legacy", key: "legacyToggle" }
]);

test("features: defaults, keys, needs", () => {
  assert.equal(FEATURES[0].key, "feature-travel"); assert.equal(FEATURES[3].key, "legacyToggle");
  const set = { "feature-travel": true, "feature-map": true };
  const get = k => { if (k in set) return set[k]; throw new Error("not registered"); };
  assert.equal(isOn(FEATURES, "map", get), true);
  assert.equal(isOn(FEATURES, "extra", get), false, "unregistered → default");
  assert.equal(isOn(FEATURES, "unknownThing", get), true);
  set["feature-travel"] = false;
  assert.equal(isOn(FEATURES, "map", get), false, "a need that is off turns the tool off");
  assert.equal(allOn(FEATURES, "travel:map", get), false); assert.equal(allOn(FEATURES, "", get), true);
  assert.deepEqual(splitNeeds(" a : b ::"), ["a", "b"]);
});
test("features: mistakes are caught at definition", () => {
  assert.throws(() => defineFeatures([{ id: "a", label: "A" }, { id: "a", label: "B" }]), /duplicate feature id/);
  assert.throws(() => defineFeatures([{ id: "a", label: "A" }, { id: "b", label: "B", key: "feature-a" }]), /duplicate setting key/);
  assert.throws(() => defineFeatures([{ id: "bad id", label: "A" }]));
  assert.throws(() => defineFeatures([{ id: "a", label: "A", needs: ["zzz"] }]), /unknown feature/);
  const loop = defineFeatures([{ id: "a", label: "A", needs: ["b"] }, { id: "b", label: "B", needs: ["a"] }]);
  assert.equal(isOn(loop, "a", () => true), false, "a need loop doesn't hang");
});

const ROWS = defineSettings([
  { key: "folder", type: "text", default: "Logs", label: "Folder", tab: "main" },
  { key: "count", type: "number", default: 3, min: 1, max: 10, step: 1, label: "Count", tab: "main", advanced: true },
  { key: "mode", type: "choice", default: "a", choices: { a: "A", b: "B" }, label: "Mode", tab: "main", feature: "map" },
  { key: "flag", type: "bool", default: false, label: "Flag", tab: "other", client: true },
  { key: "history", type: "array", default: [], hidden: true }
], { reserved: FEATURES.map(f => f.key) });

test("settings: tabs, records, scopes", () => {
  const t = tabRows(ROWS, "main");
  assert.deepEqual(t.basic.map(r => r.key), ["folder", "mode"]); assert.deepEqual(t.advanced.map(r => r.key), ["count"]);
  assert.deepEqual(tabRows(ROWS, "main", spec => spec !== "map").basic.map(r => r.key), ["folder"]);
  assert.deepEqual(records(ROWS), ["history"]);
  assert.equal(scopeOf(ROWS[3]), "client"); assert.equal(scopeOf(ROWS[0]), "world");
});
test("settings: converters clamp and refuse", () => {
  const [folder, count, mode, flag] = ROWS;
  assert.equal(convert(count, "42"), 10); assert.equal(convert(count, "2.6"), 3); assert.equal(convert(count, "x"), null); assert.equal(convert(count, ""), null);
  assert.equal(convert(folder, "  "), "Logs"); assert.equal(convert(folder, " New "), "New");
  assert.equal(convert(mode, "b"), "b"); assert.equal(convert(mode, "c"), null); assert.equal(convert(mode, "toString"), null);
  assert.equal(convert(flag, "on"), true); assert.equal(convert(flag, undefined), false);
});
test("settings: registration data and definition checks", () => {
  assert.deepEqual(registration(ROWS[1]), { scope: "world", config: false, type: "number", default: 3, name: "Count", hint: "", range: { min: 1, max: 10, step: 1 } });
  assert.equal(registration(ROWS[4]).name, undefined);
  assert.throws(() => defineSettings([{ key: "feature-travel", type: "bool", default: true }], { reserved: ["feature-travel"] }), /reserved/);
  assert.throws(() => defineSettings([{ key: "a", type: "bool", default: true }, { key: "a", type: "bool", default: true }]), /duplicate/);
  assert.throws(() => defineSettings([{ key: "m", type: "choice", default: "z", choices: { a: "A" } }]), /choices/);
  assert.throws(() => defineSettings([{ key: "n", type: "number", default: "1" }]));
  assert.throws(() => defineSettings([{ key: "s", type: "date", default: 1 }]));
});

test("health: wrapped checks never throw and sections group lines", async () => {
  const h = healthCollector({ timeoutMs: 50 });
  h.check(add => add("ok", "<b>Leader</b> ready"));
  h.check(() => { throw new Error("broken"); });
  h.section("Files");
  h.add("error", "missing");
  await h.checkAsync("Slow", () => new Promise(() => {}));
  await h.checkAsync("Async", async add => { add("info", "fine"); });
  await h.checkAsync("Empty", () => {});
  const r = h.report();
  assert.deepEqual(r.map(s => s.title), ["", "Files", "Slow", "Async"]);
  assert.deepEqual(r[0].lines, [{ level: "ok", text: "Leader ready" }, { level: "warn", text: "A check failed to run: broken" }]);
  assert.equal(r[1].lines[0].level, "bad"); assert.match(r[2].lines[0].text, /no answer within/);
  assert.equal(worst(r), "bad"); assert.deepEqual(counts(r), { ok: 1, warn: 2, bad: 1, off: 0, info: 1 });
  assert.equal(level("whatever"), "info"); assert.equal(worst([]), "info");
});

test("cleanup: confirm word, flags, dry run, picks, settings, summary", () => {
  assert.equal(confirmed(" REMOVE "), true); assert.equal(confirmed("remove"), false); assert.equal(confirmed(null), false);
  assert.equal(hasFlags({ flags: { m: { a: 1 } } }, "m"), true);
  assert.equal(hasFlags({ flags: { m: {} } }, "m"), false);
  assert.equal(hasFlags({ _source: { flags: { m: { a: 1 } } }, flags: {} }, "m"), true);
  const cats = [["journals", "Journals (ours)", true], ["settings", "Reset settings"]];
  const plan = { journals: Array.from({ length: 7 }, (_, i) => ({ id: `j${i}`, name: `J${i}` })), settings: [] };
  const d = dryRun(cats, plan, 3);
  assert.equal(d[0].text, "Journals (ours): 7 (J0, J1, J2, …)"); assert.equal(d[0].ticked, true); assert.equal(d[1].text, "Reset settings: 0");
  assert.deepEqual(picked(cats, { journals: true, settings: true }, plan), ["journals"]);
  assert.deepEqual(changedSettings([{ key: "a", scope: "world", default: 1, value: 2 }, { key: "b", scope: "world", default: [1], value: [1] }, { key: "c", scope: "client", default: 1, value: 3 }]), [{ key: "a", name: "a" }]);
  assert.equal(summary({ journals: 7 }, cats), "Journals: 7"); assert.equal(summary({}), "nothing");
});

const DEFS = new Map([
  ["count", { scope: "world", type: Number, range: { min: 1, max: 10 }, name: "Count" }],
  ["mode", { scope: "world", type: String, choices: { a: "A", b: "B" } }],
  ["flag", { scope: "client", type: Boolean }],
  ["obj", { scope: "world", type: Object }]
]);
test("settings file: export skips records and sorts keys", () => {
  const f = buildExport("my-mod", [{ key: "mode", scope: "world", value: "a" }, { key: "count", scope: "world", value: 3 }, { key: "flag", scope: "client", value: true }, { key: "history", scope: "world", value: [1] }], { version: "1.0.0", skip: ["history"] });
  assert.deepEqual(Object.keys(f.world), ["count", "mode"]); assert.deepEqual(f.client, { flag: true }); assert.equal(f.module, "my-mod"); assert.equal(f.format, 1);
});
test("settings file: import validates, clamps and reports", () => {
  const file = JSON.stringify({ module: "my-mod", format: 1, version: "1.0.0", world: { count: 50, mode: "z", flag: false, gone: 1, history: [] }, client: { obj: "x" } });
  const r = readImport("my-mod", file, DEFS, { count: 3, flag: true }, { skip: ["history"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map(x => [x.key, x.to, x.changed]), [["count", 10, true], ["flag", false, true]]);
  assert.match(r.rows[1].note, /applied as a client setting/);
  assert.deepEqual(r.unknown, ["gone"]); assert.deepEqual(r.skipped, ["history"]); assert.deepEqual(r.invalid.map(i => i.key), ["mode", "obj"]);
});
test("settings file: wrong module, format and JSON are refused", () => {
  assert.match(readImport("my-mod", "{", DEFS).error, /valid JSON/);
  assert.match(readImport("my-mod", { module: "other", format: 1 }, DEFS).error, /for "other"/);
  assert.match(readImport("my-mod", { module: "my-mod", format: 2 }, DEFS).error, /format 2/);
  assert.match(readImport("my-mod", { module: "my-mod", format: 1, world: [] }, DEFS).error, /should be a list/);
  assert.equal(readImport("my-mod", { world: { count: 2 } }, DEFS, {}, { requireModule: false }).ok, true, "a hub bundle entry may omit module and format");
  assert.equal(checkValue({ type: "ColorField" }, "#fff").ok, true);
  assert.equal(preview("x".repeat(100), 10).length, 10);
  assert.equal(fileName("my-mod", "My World", new Date(2026, 9, 31)), "my-mod-settings-my-world-2026-10-31.json");
});

const NOTES = [
  { version: "1.2.0", changes: ["Two", { text: "Map only", feature: "map" }], actions: [{ id: "setup", label: "Run setup", check: () => true }] },
  { version: "1.1.0", changes: [], actions: [{ id: "done", label: "Done", check: () => false }, { id: "broken", label: "Broken", check: () => { throw new Error("x"); } }] },
  { version: "1.0.0", changes: ["One"] }
];
test("update notes: decide", () => {
  assert.deepEqual(decide({ stored: "", current: "1.2.0" }), { kind: "fresh", from: null });
  assert.deepEqual(decide({ stored: "", current: "1.2.0", knownWorld: true }), { kind: "upgrade", from: null });
  assert.deepEqual(decide({ stored: "1.0.0", current: "1.2.0" }), { kind: "upgrade", from: "1.0.0" });
  assert.deepEqual(decide({ stored: "1.3.0", current: "1.2.0" }), { kind: "downgrade", from: "1.3.0" });
  assert.equal(decide({ stored: "1.2.0", current: "1.2.0" }).kind, "same");
  assert.equal(decide({ stored: "1.0.0", current: "dev" }).kind, "same");
});
test("update notes: entries, feature gating, action checks", async () => {
  assert.deepEqual(entriesBetween(NOTES, "1.0.0", "1.2.0").map(n => n.version), ["1.2.0", "1.1.0"]);
  const n = await buildNotice({ notes: NOTES, from: "1.0.0", to: "1.2.0", on: f => f !== "map", always: [{ id: "setup", label: "dup", check: () => true }] });
  assert.deepEqual(n.entries, [{ version: "1.2.0", changes: ["Two"] }]);
  assert.deepEqual(n.actions.map(a => [a.id, a.label]), [["setup", "Run setup"]]);
  assert.equal(n.post, true);
  assert.equal((await buildNotice({ notes: NOTES, from: "1.2.0", to: "1.2.0" })).post, false);
  assert.deepEqual(lintNotes(NOTES), []);
  assert.equal(lintNotes([{ version: "1.0.0" }, { version: "1.1.0" }]).length, 1);
});
