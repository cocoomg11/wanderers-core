import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DATA_FOLDER_NAME, pickDataFolder, dataFolderData, dataFolderPlan, folderEmptyAfter
} from "../src/data-folder-model.mjs";
import { ensureDataFolder, fileInDataFolder, removeDataFolderIfEmpty } from "../src/foundry/data-folder.mjs";
import * as pure from "../src/index.mjs";
import * as fnd from "../src/foundry/index.mjs";

const F = (o = {}) => ({ id: "f1", name: "Module data", type: "JournalEntry", folder: null, sort: 0, ...o });

test("pickDataFolder: exact name, type and root only", () => {
  assert.equal(pickDataFolder([]), null);
  assert.equal(pickDataFolder(null), null);
  assert.equal(pickDataFolder([F({ name: "module data" }), F({ type: "Actor" }), F({ folder: "p" })]), null);
  assert.equal(pickDataFolder([F({ id: "b", sort: 5 }), F({ id: "a", sort: 9 }), F({ id: "c", sort: 5 })]).id, "b");
  assert.equal(pickDataFolder([F({ id: "z" }), F({ id: "a" })]).id, "a");
  assert.equal(pickDataFolder([F({ id: "n", folder: { id: "p" } }), F({ id: "r" })]).id, "r");
});

test("dataFolderData and plan", () => {
  const d = dataFolderData();
  assert.deepEqual([d.name, d.type, d.sorting], [DATA_FOLDER_NAME, "JournalEntry", "m"]);
  assert.ok(d.sort >= 1e9);
  assert.ok(!("color" in d) && !("flags" in d));
  assert.deepEqual(dataFolderPlan({ folders: [], entry: { folder: null } }), { create: d, move: true });
  assert.deepEqual(dataFolderPlan({ folders: [F()], entry: { folder: null } }), { create: null, move: true });
  assert.deepEqual(dataFolderPlan({ folders: [F()], entry: { folder: "mine" } }), { create: null, move: false });
  assert.deepEqual(dataFolderPlan({ folders: [], entry: { folder: "mine" } }), { create: null, move: false });
  assert.deepEqual(dataFolderPlan({ folders: [], entry: null }), { create: d, move: false });
});

test("folderEmptyAfter", () => {
  assert.equal(folderEmptyAfter([], []), true);
  assert.equal(folderEmptyAfter(["a"], ["a"]), true);
  assert.equal(folderEmptyAfter(["a", "b"], ["a"]), false);
  assert.equal(folderEmptyAfter(["a"], undefined), false);
  assert.equal(folderEmptyAfter(undefined, ["a"]), true);
});

test("exported from both indexes", () => {
  for (const k of ["DATA_FOLDER_NAME", "pickDataFolder", "dataFolderPlan", "folderEmptyAfter"]) assert.ok(k in pure, k);
  for (const k of ["ensureDataFolder", "fileInDataFolder", "removeDataFolderIfEmpty"]) assert.ok(k in fnd, k);
});

// Foundry halves against a fake world
let world, warns;
const mkFolder = data => {
  const f = { id: `fo${world.folders.length + 1}`, ...data, deleted: false, async delete() { this.deleted = true; world.folders.splice(world.folders.indexOf(this), 1); } };
  world.folders.push(f); return f;
};
const mkEntry = (id, folder = null) => { const e = { id, folder, async update(d) { Object.assign(this, d); } }; world.journal.push(e); return e; };
beforeEach(() => {
  world = { folders: [], journal: [] }; warns = [];
  globalThis.game = { user: { isGM: true }, get folders() { return world.folders; }, get journal() { return world.journal; } };
  globalThis.Folder = { create: async d => mkFolder(d) };
});
const log = { warn: (...a) => warns.push(a) };

test("ensureDataFolder creates once and reuses", async () => {
  const a = await ensureDataFolder("m1");
  const b = await ensureDataFolder("m2");
  assert.equal(a, b);
  assert.equal(world.folders.length, 1);
  assert.equal(a.name, "Module data");
});

test("players do nothing; failures only warn", async () => {
  globalThis.game.user.isGM = false;
  assert.equal(await ensureDataFolder("m"), null);
  assert.equal(await fileInDataFolder("m", mkEntry("j1")), false);
  assert.equal(world.folders.length, 0);
  globalThis.game.user.isGM = true;
  globalThis.Folder = { create: async () => { throw new Error("nope"); } };
  assert.equal(await ensureDataFolder("m", { log }), null);
  assert.equal(await fileInDataFolder("m", mkEntry("j2"), { log }), false);
  assert.equal(warns.length, 2);
});

test("fileInDataFolder moves root entries only", async () => {
  const e = mkEntry("j1");
  assert.equal(await fileInDataFolder("m", e), true);
  assert.equal(e.folder, world.folders[0].id);
  const own = mkEntry("j2", "gmFolder");
  assert.equal(await fileInDataFolder("m", own), false);
  assert.equal(own.folder, "gmFolder");
  assert.equal(world.folders.length, 1);
  const other = mkEntry("j3");
  assert.equal(await fileInDataFolder("m2", other), true);
  assert.equal(world.folders.length, 1);
  assert.equal(await fileInDataFolder("m", null), false);
});

test("removeDataFolderIfEmpty keeps a shared folder", async () => {
  const a = mkEntry("j1"), b = mkEntry("j2");
  await fileInDataFolder("m", a); await fileInDataFolder("m2", b);
  const fid = world.folders[0].id;
  assert.equal(await removeDataFolderIfEmpty("m", ["j1"]), false);
  assert.equal(world.folders.length, 1);
  world.journal.splice(world.journal.indexOf(a), 1);
  assert.equal(await removeDataFolderIfEmpty("m", []), false);
  assert.equal(await removeDataFolderIfEmpty("m2", ["j2"]), true);
  assert.equal(world.folders.length, 0);
  assert.equal(await removeDataFolderIfEmpty("m2", ["j2"]), false);
  mkFolder({ name: "Module data", type: "JournalEntry", folder: null }); mkEntry("x", fid);
  world.folders[0].id = fid;
  assert.equal(await removeDataFolderIfEmpty("m", []), false);
});

import { dataFolderShown, dataFolderIds, SHOW_SETTING } from "../src/data-folder-model.mjs";
import { hideDataFolder } from "../src/foundry/data-folder.mjs";

test("dataFolderShown: any true shows", () => {
  assert.equal(dataFolderShown([]), false);
  assert.equal(dataFolderShown([false, null, "yes", 1]), false);
  assert.equal(dataFolderShown([false, true]), true);
  assert.equal(SHOW_SETTING, "showModuleData");
});

test("dataFolderIds: folder, nested folders and entries", () => {
  const folders = [F({ id: "root" }), F({ id: "sub", name: "x", folder: "root" }), F({ id: "other", name: "Mine" })];
  const entries = [{ id: "a", folder: "root" }, { id: "b", folder: { id: "sub" } }, { id: "c", folder: "other" }, { id: "d", folder: null }];
  assert.deepEqual(dataFolderIds(folders, entries), { folders: ["root", "sub"], entries: ["a", "b"] });
  assert.deepEqual(dataFolderIds([], entries), { folders: [], entries: [] });
});

test("hideDataFolder removes the elements unless any module shows them", () => {
  let cb; let n = 0;
  globalThis.Hooks = { on: (name, fn) => { assert.equal(name, "renderJournalDirectory"); cb = fn; return ++n; } };
  const folder = mkFolder({ name: "Module data", type: "JournalEntry", folder: null });
  mkEntry("j1", folder.id);
  const els = new Set([`f:${folder.id}`, "e:j1", "e:keep"]);
  const root = { querySelectorAll: sel => {
    const m = /data-(folder|entry)-id="([^"]+)"/.exec(sel);
    const key = `${m[1][0]}:${m[2]}`;
    return els.has(key) ? [{ remove: () => els.delete(key) }] : [];
  } };
  const settings = new Map();
  globalThis.game.modules = new Map([["other", { id: "other", active: true }]]);
  globalThis.game.settings = { settings, get: (ns, k) => settings.get(`${ns}.${k}`) };
  assert.equal(hideDataFolder("tst-mod", { shown: () => false }), 1);
  assert.equal(hideDataFolder("tst-mod"), null);
  settings.set("other.showModuleData", true);
  cb({}, root);
  assert.equal(els.size, 3);
  settings.set("other.showModuleData", false);
  cb({}, { 0: root });
  assert.deepEqual([...els], ["e:keep"]);
});
