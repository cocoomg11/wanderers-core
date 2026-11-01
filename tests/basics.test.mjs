import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Core from "../src/index.mjs";
import { esc, plain, plural, slug, isoDay } from "../src/text.mjs";
import { parseVersion, compareVersions, isReleaseTag, tagVersion, CORE_VERSION } from "../src/version.mjs";
import { addCapped, capList, versioned } from "../src/records.mjs";

test("CORE_VERSION matches package.json", () => {
  assert.equal(CORE_VERSION, JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
});

test("esc escapes HTML special characters and handles null", () => {
  assert.equal(esc(`<a href="x">Tom & 'Jo'</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jo&#39;&lt;/a&gt;");
  assert.equal(esc(null), ""); assert.equal(esc(undefined), ""); assert.equal(esc(3), "3");
});
test("plain drops tags, decodes entities, collapses space", () => {
  assert.equal(plain("<p>Hello&nbsp;<b>world</b></p>\n &amp; &lt;more&gt;"), "Hello world & <more>");
  assert.equal(plain(null), "");
});
test("plural, slug, isoDay", () => {
  assert.equal(plural(1, "tab"), "1 tab"); assert.equal(plural(0, "tab"), "0 tabs"); assert.equal(plural(2, "body", "bodies"), "2 bodies");
  assert.equal(slug("  My World: Part 2! "), "my-world-part-2");
  assert.equal(isoDay(new Date(2026, 0, 5)), "2026-01-05"); assert.equal(isoDay("nope"), "");
});

test("parseVersion reads v-prefixes, short versions and pre-releases", () => {
  assert.deepEqual(parseVersion("v1.2.3"), { parts: [1, 2, 3], pre: "" });
  assert.deepEqual(parseVersion("1.2"), { parts: [1, 2], pre: "" });
  assert.deepEqual(parseVersion("1.2.3-beta.1+build.5"), { parts: [1, 2, 3], pre: "beta.1" });
  assert.equal(parseVersion("abc"), null); assert.equal(parseVersion(null), null); assert.equal(parseVersion(""), null);
});
test("compareVersions follows semver order", () => {
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("v1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.0.0-beta", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.10"), -1);
  assert.equal(compareVersions("1.0.0-alpha", "1.0.0-alpha.1"), -1);
  assert.equal(compareVersions("1.0.0-1", "1.0.0-alpha"), -1);
  assert.equal(compareVersions("x", "1.0.0"), null);
});
test("release tags are vMAJOR.MINOR.PATCH only", () => {
  for (const t of ["v1.24.0", "v0.1.0", "v10.0.12"]) assert.equal(isReleaseTag(t), true, t);
  for (const t of ["1.24.0", "v1.24", "v1", "v1.2.3-beta", "v01.2.3", "V1.2.3", "v1.2.3 ", 123]) assert.equal(isReleaseTag(t), false, String(t));
  assert.equal(tagVersion("v1.2.3"), "1.2.3"); assert.equal(tagVersion("1.2.3"), null);
});

test("addCapped puts the entry first, de-dups by key and caps", () => {
  let list = [];
  for (let i = 0; i < 7; i++) list = addCapped(list, { id: `e${i}` }, { max: 5 });
  assert.deepEqual(list.map(e => e.id), ["e6", "e5", "e4", "e3", "e2"]);
  list = addCapped(list, { id: "e4", again: true }, { max: 5 });
  assert.deepEqual(list.map(e => e.id), ["e4", "e6", "e5", "e3", "e2"]);
  assert.deepEqual(addCapped("garbage", { id: 1 }, { max: 3 }), [{ id: 1 }]);
  assert.equal(addCapped([1, 1], 1, { max: 5, key: null }).length, 3);
});
test("capList keeps the first or last entries", () => {
  assert.deepEqual(capList([1, 2, 3, 4], 2), [1, 2]);
  assert.deepEqual(capList([1, 2, 3, 4], 2, { keep: "last" }), [3, 4]);
  assert.deepEqual(capList(null, 2), []);
});

test("versioned upgrades old shapes step by step and cleans", () => {
  const read = versioned({
    version: 2, empty: () => ({ v: 2, pins: [] }),
    upgrades: { 0: old => ({ pins: old.list ?? [] }), 1: old => ({ pins: old.pins.map(p => ({ uuid: p })) }) },
    clean: x => ({ ...x, pins: capList(x.pins, 2) })
  });
  assert.deepEqual(read({ list: ["a", "b", "c"] }), { v: 2, pins: [{ uuid: "a" }, { uuid: "b" }] });
  assert.deepEqual(read({ v: 2, pins: [{ uuid: "z" }] }), { v: 2, pins: [{ uuid: "z" }] });
  assert.deepEqual(read(null), { v: 2, pins: [] });
  assert.deepEqual(read({ v: 9, other: 1 }), { v: 2, pins: [] }, "a newer shape isn't guessed at");
  const raw = { list: ["a"] }; read(raw); assert.deepEqual(raw, { list: ["a"] }, "the input is not changed");
});
test("versioned survives a failing upgrade and rejects a bad spec", () => {
  const read = versioned({ version: 1, empty: () => ({ v: 1 }), upgrades: { 0: () => { throw new Error("boom"); } } });
  assert.deepEqual(read({ x: 1 }), { v: 1 });
  assert.throws(() => versioned({ version: 0, empty: () => ({}) }));
  const keep = versioned({ version: 1, empty: () => ({ v: 1 }), keepNewer: true });
  assert.deepEqual(keep({ v: 3, a: 1 }), { v: 3, a: 1 });
});

test("the index exports every pure helper and nothing touches Foundry on import", () => {
  assert.equal(typeof Core.readRequest, "function");
  assert.equal(typeof Core.createLeader, "undefined", "Foundry halves live in src/foundry/");
  assert.equal(globalThis.game, undefined);
});
