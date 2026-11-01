import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  defineSection, orderSections, upsertSection, ownField, createRegistry, usableRegistry, claimRegistry, SCENE_TAB_GLOBAL, SCENE_TAB_ID
} from "../src/scene-tab-model.mjs";

const r = () => "";
test("sections: checked at definition, normalised", () => {
  const s = defineSection("mod-a", { title: "  Mod A ", render: r });
  assert.deepEqual({ ...s, render: null }, { moduleId: "mod-a", title: "Mod A", order: 0, render: null, onSubmit: null });
  assert.ok(Object.isFrozen(s));
  assert.throws(() => defineSection("", { title: "x", render: r }), /module id/);
  assert.throws(() => defineSection("bad id", { title: "x", render: r }), /module id/);
  assert.throws(() => defineSection("mod-a", { title: "", render: r }), /title/);
  assert.throws(() => defineSection("mod-a", { title: "x" }), /render/);
  assert.throws(() => defineSection("mod-a", { title: "x", render: r, onSubmit: "save" }), /onSubmit/);
  assert.throws(() => defineSection("mod-a", { title: "x", render: r, order: "first" }), /order/);
  assert.throws(() => defineSection("mod-a", null));
});
test("sections: ordered by order, then title, then module id; one per module", () => {
  const a = defineSection("zeta", { title: "Alpha", render: r });
  const b = defineSection("alpha", { title: "beta", render: r });
  const c = defineSection("mid", { title: "Gamma", order: -1, render: r });
  const d = defineSection("aaa", { title: "alpha", render: r });
  assert.deepEqual(orderSections([a, b, c, d]).map(s => s.moduleId), ["mid", "aaa", "zeta", "alpha"]);
  let list = upsertSection([], a); list = upsertSection(list, b);
  list = upsertSection(list, defineSection("zeta", { title: "Zed", render: r }));
  assert.deepEqual(list.map(s => [s.moduleId, s.title]), [["alpha", "beta"], ["zeta", "Zed"]], "adding again replaces");
});
test("field names: only flags.<moduleId>.<path>", () => {
  assert.equal(ownField("mod-a", "flags.mod-a.x"), true);
  assert.equal(ownField("mod-a", "flags.mod-a.deep.x"), true);
  for (const bad of ["flags.mod-b.x", "flags.mod-a.", "flags.mod-a", "name", "flags.mod-ab.x", "flags.mod-a..x", "flags.mod-a.__proto__.x", "flags.mod-a.constructor", null]) {
    assert.equal(ownField("mod-a", bad), false, String(bad));
  }
});
test("registry: created once on the host, reused by every copy whatever its version", () => {
  const host = {};
  const one = claimRegistry(host); const two = claimRegistry(host);
  assert.equal(one.created, true); assert.equal(two.created, false); assert.equal(one.registry, two.registry);
  assert.equal(Object.keys(host).length, 0, "not enumerable");
  assert.throws(() => { "use strict"; host[SCENE_TAB_GLOBAL] = {}; }, TypeError, "a copy can't overwrite it by assignment");
  one.registry.add(defineSection("b-mod", { title: "B", render: r }));
  two.registry.add(defineSection("a-mod", { title: "A", render: r }));
  assert.deepEqual(one.registry.list().map(s => s.moduleId), ["a-mod", "b-mod"]);
  one.registry.remove("a-mod"); assert.deepEqual(two.registry.list().map(s => s.moduleId), ["b-mod"]);
  assert.equal(one.registry.tabId, SCENE_TAB_ID); assert.equal(one.registry.version, 1);
  const newer = { ...createRegistry(), version: 2 };
  assert.equal(usableRegistry(newer), true, "a newer registry that keeps the version-1 calls is used");
  for (const junk of [null, 5, {}, { version: 0, add() {}, remove() {}, list() {} }, { version: 1, add: 1, remove() {}, list() {} }]) assert.equal(usableRegistry(junk), false);
  const taken = { [SCENE_TAB_GLOBAL]: "junk" };
  assert.equal(claimRegistry(taken).created, true, "junk on the global is replaced");
});

beforeEach(() => {
  delete globalThis[SCENE_TAB_GLOBAL];
  globalThis.Hooks = { added: [], on(n, fn) { this.added.push([n, fn]); return this.added.length; } };
});
test("two bundled copies of the Foundry half add one render hook between them", async () => {
  const A = (await import("../src/foundry/scene-tab.mjs?copy=a")).sceneTab;
  const B = (await import("../src/foundry/scene-tab.mjs?copy=b")).sceneTab;
  B.addSection("red-mod", { title: "Red", render: () => "<input name='flags.red-mod.x'>" });
  A.addSection("blue-mod", { title: "Blue", render: () => null });
  A.addSection("blue-mod", { title: "Blue tools", render: () => null });
  assert.deepEqual(globalThis.Hooks.added.map(([n]) => n), ["renderSceneConfig"]);
  assert.deepEqual(A.sections(), [{ moduleId: "blue-mod", title: "Blue tools", order: 0 }, { moduleId: "red-mod", title: "Red", order: 0 }]);
  assert.deepEqual(B.sections(), A.sections());
  B.removeSection("blue-mod"); assert.deepEqual(A.sections().map(s => s.moduleId), ["red-mod"]);
  assert.throws(() => A.addSection("blue-mod", { title: "x" }), /render/);
});
test("one module alone: the tab is created by it", async () => {
  const A = (await import("../src/foundry/scene-tab.mjs?copy=solo")).sceneTab;
  assert.deepEqual(A.sections(), []);
  A.addSection("solo-mod", { title: "Solo", render: () => "" });
  assert.equal(globalThis.Hooks.added.length, 1); assert.equal(A.sections().length, 1);
});
