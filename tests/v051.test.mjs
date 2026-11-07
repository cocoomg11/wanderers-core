/* global JournalEntry, Folder */
/**
 * 0.5.1: several "Module data" folders (modules creating it at the same moment): all hidden, creators converge, each module's
 * writer merges its own entry and the emptied extras go.
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as Core from "../src/index.mjs";
import * as Fnd from "../src/foundry/index.mjs";
import { dataFolders, pickDataFolder, dataFolderIds, dataFolderMergePlan } from "../src/data-folder-model.mjs";
import { ensureDataFolder, mergeDataFolders, removeDataFolderIfEmpty } from "../src/foundry/data-folder.mjs";
import { createStore } from "../src/foundry/store.mjs";
import { fakeWorld, installFakes, actAs } from "../src/testing/index.mjs";

const F = (id, o = {}) => ({ id, name: "Module data", type: "JournalEntry", folder: null, sort: 2000000000, ...o });

/* ---- pure ---- */

test("dataFolders: every root Module data folder, picked one first", () => {
  const fs = [F("c"), F("a"), F("b"), F("n", { folder: "a" }), F("x", { name: "Other" }), F("t", { type: "Actor" })];
  assert.deepEqual(dataFolders(fs).map(f => f.id), ["a", "b", "c"]);
  assert.equal(pickDataFolder(fs).id, "a");
  assert.deepEqual(dataFolders(null), []);
  assert.deepEqual(dataFolders([F("lo", { sort: 1 }), F("aa")]).map(f => f.id), ["lo", "aa"], "sort first, then id");
});

test("dataFolderIds hides every data folder, their subfolders and entries", () => {
  const fs = [F("a"), F("b"), F("c"), { id: "sub", name: "Sub", type: "JournalEntry", folder: "b" }, { id: "gm", name: "GM", type: "JournalEntry", folder: null }];
  const es = [{ id: "e1", folder: "a" }, { id: "e2", folder: "b" }, { id: "e3", folder: { id: "c" } }, { id: "e4", folder: "sub" }, { id: "e5", folder: "gm" }, { id: "e6", folder: null }];
  const ids = dataFolderIds(fs, es);
  assert.deepEqual(ids.folders.sort(), ["a", "b", "c", "sub"]);
  assert.deepEqual(ids.entries.sort(), ["e1", "e2", "e3", "e4"]);
});

test("dataFolderMergePlan: only own entries move; a folder goes only once empty", () => {
  const fs = [F("a"), F("b"), F("c"), F("d")];
  const es = [{ id: "mine1", folder: "b" }, { id: "mine2", folder: "a" }, { id: "theirs", folder: "c" }, { id: "mine3", folder: null }];
  const p = dataFolderMergePlan({ folders: fs, entries: es, own: ["mine1", "mine2", "mine3"] });
  assert.equal(p.target, "a");
  assert.deepEqual(p.move, ["mine1"], "already in the target or at the root: not moved");
  assert.deepEqual(p.remove.sort(), ["b", "d"], "c keeps another module's entry");
  // a subfolder (GM's) keeps an extra folder too
  const sub = dataFolderMergePlan({ folders: [F("a"), F("b"), { id: "s", name: "S", type: "JournalEntry", folder: "b" }], entries: [], own: [] });
  assert.deepEqual(sub.remove, []);
  // one folder or none: nothing to do
  assert.deepEqual(dataFolderMergePlan({ folders: [F("a")], entries: [{ id: "m", folder: "a" }], own: ["m"] }), { target: "a", move: [], remove: [] });
  assert.deepEqual(dataFolderMergePlan({ folders: [], entries: [], own: [] }), { target: null, move: [], remove: [] });
  assert.deepEqual(dataFolderMergePlan(), { target: null, move: [], remove: [] });
});

test("new exports in both indexes", () => {
  for (const k of ["dataFolders", "dataFolderMergePlan"]) assert.equal(typeof Core[k], "function", k);
  assert.equal(typeof Fnd.mergeDataFolders, "function");
  assert.ok(Core.compareVersions(Core.CORE_VERSION, "0.5.1") >= 0, "0.5.1 or later");
});

/* ---- Foundry halves on core's fakes ---- */

let world, gm, restore;
beforeEach(() => {
  world = fakeWorld({ users: [{ id: "gm00000000000001", name: "GM", isGM: true }, { id: "pl00000000000001", name: "Pat" }] });
  [gm] = world.users.contents;
  restore = installFakes(world, gm);
});
afterEach(() => restore());

/** Makes Folder.create wait until `open()` so several creators all see no folder first (the live race). */
function slowFolders() {
  const real = Folder.create;
  let open; const gate = new Promise(r => { open = r; });
  globalThis.Folder.create = async d => { await gate; return real(d); };
  return () => { open(); };
}
const dataIds = () => dataFolders([...world.folders]).map(f => f.id);

test("race: three creators make three folders but all use the picked one", async () => {
  const open = slowFolders();
  const p = Promise.all(["toolkit", "red-book", "satchel"].map(m => ensureDataFolder(m)));
  open();
  const got = await p;
  assert.equal(dataIds().length, 3, "the race still makes three (no lock across modules)");
  const pick = pickDataFolder([...world.folders]);
  for (const f of got) assert.equal(f, pick, "every creator converges on the same folder");
});

test("race through createStore: three stores land in one folder; the writers' file() deletes the empty extras", async () => {
  const open = slowFolders();
  const stores = ["toolkit", "red-book", "satchel"].map(m => createStore(m, { name: `${m} (GM only)` }));
  const writes = Promise.all(stores.map(s => s.set("x", 1)));
  open();
  await writes;
  const pick = pickDataFolder([...world.folders]);
  for (const s of stores) assert.equal(s.entry().folder, pick.id);
  assert.equal(dataIds().length, 3);
  await stores[0].file();
  assert.deepEqual(dataIds(), [pick.id], "the empty extras are gone after the first writer's file()");
  for (const s of stores) assert.equal(await s.file(), false, "already filed");
});

test("three modules each in their own folder: each merges only its own entry, the world converges on one folder", async () => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => Folder.create({ name: "Module data", type: "JournalEntry", sort: 2000000000 })));
  const names = ["toolkit", "red-book", "satchel"];
  const ents = await Promise.all(names.map((m, i) => JournalEntry.create({ name: m, folder: [a, b, c][i].id, flags: { [m]: { storeEntry: true, store: {} } } })));
  const gmNote = await JournalEntry.create({ name: "GM's own", folder: c.id });
  const pick = pickDataFolder([...world.folders]);
  const stores = names.map(m => createStore(m, { name: m, isWriter: () => true }));
  const before = new Map(ents.map(e => [e.id, e.folder]));

  await stores[1].file(); // Red Book's writer: only its own entry moves
  for (const [i, e] of ents.entries()) {
    if (i === 1) assert.equal(e.folder, pick.id);
    else assert.equal(e.folder, before.get(e.id), "another module's entry is never moved");
  }
  await stores[0].file();
  await stores[2].file();
  for (const e of ents) assert.equal(e.folder, pick.id);
  assert.equal(gmNote.folder, c.id, "the GM's own entry is never moved");
  assert.equal(dataIds().length, c.id === pick.id ? 1 : 2, "a folder holding the GM's entry stays");
  const extras = dataIds().filter(id => id !== pick.id);
  for (const id of extras) assert.equal(id, c.id);
  // Hiding covers every one of them.
  const ids = dataFolderIds([...world.folders], [...world.journal]);
  for (const id of dataIds()) assert.ok(ids.folders.includes(id));
  assert.ok(ids.entries.includes(gmNote.id));
});

test("mergeDataFolders: players and one folder do nothing; failures only warn", async () => {
  const one = await Folder.create({ name: "Module data", type: "JournalEntry" });
  const e = await JournalEntry.create({ name: "e", folder: one.id });
  assert.deepEqual(await mergeDataFolders("m", { entries: [e] }), { moved: 0, removed: 0 });
  const two = await Folder.create({ name: "Module data", type: "JournalEntry" });
  const e2 = await JournalEntry.create({ name: "e2", folder: two.id });
  actAs(world, "pl00000000000001");
  assert.deepEqual(await mergeDataFolders("m", { entries: [e2] }), { moved: 0, removed: 0 });
  actAs(world, gm);
  const warns = [];
  const target = pickDataFolder([...world.folders]);
  const loser = target.id === one.id ? e2 : e;
  const realGet = world.journal.get;
  world.journal.get = id => (id === loser.id ? { id, update: async () => { throw new Error("nope"); } } : realGet.call(world.journal, id));
  assert.deepEqual(await mergeDataFolders("m", { entries: [loser.id], log: { warn: (...a) => warns.push(a) } }), { moved: 0, removed: 0 });
  assert.equal(warns.length, 1);
  assert.equal(dataIds().length, 2, "nothing deleted while the entry is still there");
  world.journal.get = realGet;
  assert.deepEqual(await mergeDataFolders("m", { entries: [loser.id] }), { moved: 1, removed: 1 });
  assert.equal(dataIds().length, 1);
});

test("removeDataFolderIfEmpty deletes every empty data folder, keeps the others", async () => {
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => Folder.create({ name: "Module data", type: "JournalEntry" })));
  const mine = await JournalEntry.create({ name: "mine", folder: a.id });
  await JournalEntry.create({ name: "theirs", folder: b.id });
  assert.equal(await removeDataFolderIfEmpty("m", [mine.id]), true);
  assert.deepEqual(dataIds(), [b.id]);
  assert.ok(c.deleted && a.deleted);
});
