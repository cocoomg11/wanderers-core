/**
 * 0.6.0: guest pages (pages-model.mjs): the definition reader, ordering, the host registry, renderGuest / activateGuest.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as Core from "../src/index.mjs";
import {
  readPageDef, orderPages, createPageHost, renderGuest, activateGuest, PAGE_GUESTS_MAX, PAGE_LABEL_MAX, PAGE_HINT_MAX, PAGE_ICON_MAX
} from "../src/pages-model.mjs";

const render = () => "<p>hi</p>";
const def = (o = {}) => ({ id: "guild.professions", label: "Professions", render, ...o });
const quiet = () => { const said = []; return { said, warn: (...a) => said.push(a.map(String).join(" ")) }; };

test("the index exports the guest page helpers", () => {
  for (const k of ["readPageDef", "orderPages", "createPageHost", "renderGuest", "activateGuest", "PAGE_ID_RE", "PAGE_GUESTS_MAX"]) assert.ok(k in Core, k);
  assert.equal(Core.CORE_VERSION, "0.6.0");
});

test("readPageDef accepts a good definition and normalises it", () => {
  const r = readPageDef(def({ hint: "  from tools ", icon: "M14 6l4 4M3 21l9-9", order: 85, visible: () => true, activate: () => {}, extra: 1 }));
  assert.equal(r.ok, true);
  const p = /** @type {any} */ (r).page;
  assert.equal(p.id, "guild.professions"); assert.equal(p.hint, "from tools"); assert.equal(p.icon, "M14 6l4 4M3 21l9-9"); assert.equal(p.fa, null);
  assert.equal(p.order, 85); assert.equal(p.guest, true); assert.ok(Object.isFrozen(p)); assert.equal("extra" in p, false);
  const bare = /** @type {any} */ (readPageDef(def())).page;
  assert.deepEqual([bare.hint, bare.icon, bare.fa, bare.order, bare.visible, bare.activate], ["", null, null, null, null, null]);
});

test("readPageDef: icon as Font Awesome classes, or fa", () => {
  assert.equal(/** @type {any} */ (readPageDef(def({ icon: "fa-solid fa-hammer" }))).page.fa, "fa-solid fa-hammer");
  assert.equal(/** @type {any} */ (readPageDef(def({ icon: "fa-solid fa-hammer" }))).page.icon, null);
  const both = /** @type {any} */ (readPageDef(def({ icon: "M1 1h2", fa: "fa-regular fa-star" }))).page;
  assert.deepEqual([both.icon, both.fa], ["M1 1h2", "fa-regular fa-star"]);
  assert.equal(readPageDef(def({ fa: "M1 1h2" })).ok, false, "fa must be classes");
});

test("readPageDef refuses bad definitions with a reason and never throws", () => {
  const bad = [
    null, 5, "x", [], {},
    def({ id: "noDot" }), def({ id: "Guild.page" }), def({ id: "guild.pa ge" }), def({ id: "guild.page.sub" }), def({ id: `guild.${"a".repeat(80)}` }),
    def({ label: "" }), def({ label: 5 }), def({ label: "x".repeat(PAGE_LABEL_MAX + 1) }),
    def({ hint: 5 }), def({ hint: "x".repeat(PAGE_HINT_MAX + 1) }),
    def({ icon: "<path d='M1 1'/>" }), def({ icon: "M1 1\" onload=\"x" }), def({ icon: "url(#x)" }), def({ icon: "1 1 L2 2" }),
    def({ icon: `M${"1 ".repeat(PAGE_ICON_MAX)}` }), def({ icon: "fa-solid" }), def({ icon: "fas fa-x" }), def({ icon: "fa-solid fa-x\"" }), def({ icon: 3 }),
    def({ order: "5" }), def({ order: NaN }), def({ order: Infinity }),
    def({ render: undefined }), def({ render: "<p>" }), def({ visible: true }), def({ activate: "x" })
  ];
  for (const b of bad) {
    const r = readPageDef(b);
    assert.equal(r.ok, false, JSON.stringify(b));
    assert.equal(typeof /** @type {any} */ (r).reason, "string");
  }
  const trap = { get id() { throw new Error("boom"); } };
  assert.match(/** @type {any} */ (readPageDef(trap)).reason, /couldn't be read \(boom\)/);
  assert.equal(readPageDef(def({ label: "x".repeat(PAGE_LABEL_MAX) })).ok, true, "exactly at the limit");
});

test("orderPages: by order (null last), built-ins before guests on a tie, then id", () => {
  const list = [
    { id: "z.late", order: null, guest: true }, { id: "b.page", order: 20, guest: true }, { id: "details", order: 20, guest: false },
    { id: "a.page", order: 20, guest: true }, { id: "character", order: 10, guest: false }, { id: "a.none", guest: true }
  ];
  assert.deepEqual(orderPages(list).map(p => p.id), ["character", "details", "a.page", "b.page", "a.none", "z.late"]);
  assert.deepEqual(orderPages(null), []);
});

test("createPageHost throws on the host's own mistakes", () => {
  assert.throws(() => createPageHost(/** @type {any} */ ({})), /host module id/);
  assert.throws(() => createPageHost({ hostId: "h", builtIn: [{ id: "a" }] }), /numeric order/);
  assert.throws(() => createPageHost({ hostId: "h", builtIn: [{ id: "a", order: 1 }, { id: "a", order: 2 }] }), /unique/);
  assert.throws(() => createPageHost({ hostId: "h", builtIn: [{ id: "a", order: 1, visible: 1 }] }), /visible/);
  assert.throws(() => createPageHost({ hostId: "h", onChange: /** @type {any} */ (1) }), /onChange/);
  assert.throws(() => createPageHost({ hostId: "h", max: -1 }), /max/);
});

test("register / replace / off / unregister, with onChange after each change", () => {
  const changes = []; const q = quiet();
  const host = createPageHost({ hostId: "host", builtIn: [{ id: "character", order: 10, label: "Character" }, { id: "special", order: 90 }], onChange: c => changes.push(c), warn: q.warn });
  const off = host.register(def({ order: 50 }));
  assert.equal(off.ok, true);
  assert.deepEqual(host.pages().map(p => p.id), ["character", "guild.professions", "special"]);
  assert.equal(host.get("character")?.label, "Character"); assert.equal(host.get("character")?.guest, false);
  assert.ok(host.has("guild.professions")); assert.ok(host.has("special")); assert.equal(host.has("nope"), false);
  // A second register of the id replaces the first; the old off() leaves the new one alone.
  const off2 = host.register(def({ label: "Crafts", order: 95 }));
  assert.equal(host.size(), 1); assert.equal(host.get("guild.professions")?.label, "Crafts");
  assert.deepEqual(host.pages().map(p => p.id), ["character", "special", "guild.professions"]);
  assert.equal(off(), false, "stale off");
  assert.ok(host.has("guild.professions"));
  assert.equal(off2(), true); assert.equal(off2(), false);
  assert.equal(host.has("guild.professions"), false);
  host.register(def({ id: "other.page" }));
  assert.equal(host.unregister("other.page"), true); assert.equal(host.unregister("other.page"), false);
  assert.equal(host.unregister("character"), false, "built-ins can't be removed");
  assert.deepEqual(changes.map(c => `${c.type}:${c.id}`), ["register:guild.professions", "register:guild.professions", "unregister:guild.professions", "register:other.page", "unregister:other.page"]);
  assert.equal(q.said.length, 0);
});

test("a refused registration warns, returns a no-op off with the reason, and changes nothing", () => {
  const changes = []; const q = quiet();
  const host = createPageHost({ hostId: "host", onChange: c => changes.push(c), warn: q.warn });
  const off = host.register({ id: "bad", label: "x", render });
  assert.equal(off.ok, false); assert.match(String(off.reason), /my-module\.page/); assert.equal(off(), false);
  assert.equal(host.size(), 0); assert.equal(changes.length, 0); assert.match(q.said[0], /refused/);
  assert.doesNotThrow(() => host.register(undefined));
});

test("guests are capped; replacing an id at the cap still works", () => {
  const q = quiet();
  const host = createPageHost({ hostId: "host", warn: q.warn });
  for (let i = 0; i < PAGE_GUESTS_MAX; i++) assert.equal(host.register(def({ id: `m.p${i}` })).ok, true);
  const over = host.register(def({ id: "m.over" }));
  assert.equal(over.ok, false); assert.match(String(over.reason), /already has 20/);
  assert.equal(host.register(def({ id: "m.p3", label: "New" })).ok, true);
  assert.equal(host.size(), PAGE_GUESTS_MAX);
  const small = createPageHost({ hostId: "host", max: 1, warn: q.warn });
  small.register(def({ id: "m.a" })); assert.equal(small.register(def({ id: "m.b" })).ok, false);
});

test("visible(ctx) filters built-ins and guests; a throwing visible hides the page and warns once", () => {
  const q = quiet();
  const host = createPageHost({ hostId: "host", warn: q.warn, builtIn: [{ id: "a", order: 1 }, { id: "bastion", order: 80, visible: ctx => !!ctx?.bastion }] });
  host.register(def({ id: "m.mine", visible: ctx => ctx?.name === "Ann" }));
  host.register(def({ id: "m.broken", visible: () => { throw new Error("x"); } }));
  host.register(def({ id: "m.undef", visible: () => undefined }));
  assert.deepEqual(host.pages({ name: "Ann" }).map(p => p.id), ["a", "m.mine", "m.undef"]);
  assert.deepEqual(host.pages({ name: "Bob", bastion: true }).map(p => p.id), ["a", "bastion", "m.undef"]);
  assert.deepEqual(host.guests({ name: "Ann" }).map(p => p.id), ["m.mine", "m.undef"]);
  assert.equal(q.said.filter(s => s.includes("m.broken")).length, 1, "warned once");
});

test("onChange that throws is logged, the change still happens", () => {
  const q = quiet();
  const host = createPageHost({ hostId: "host", warn: q.warn, onChange: () => { throw new Error("redraw"); } });
  assert.equal(host.register(def()).ok, true); assert.ok(host.has("guild.professions"));
  assert.match(q.said[0], /refreshing after register failed/);
});

test("renderGuest: html, element, empty, and errors (throw, reject, wrong type, timeout); ctx is a frozen copy", async () => {
  const ctx = { actor: { name: "Ann" }, mode: "play" };
  let seen;
  assert.deepEqual(await renderGuest({ id: "m.p", render: c => { seen = c; return "<b>x</b>"; } }, ctx), { html: "<b>x</b>" });
  assert.ok(Object.isFrozen(seen)); assert.notEqual(seen, ctx); assert.equal(seen.actor, ctx.actor);
  assert.deepEqual(await renderGuest({ id: "m.p", render: async () => "<i>y</i>" }), { html: "<i>y</i>" });
  assert.deepEqual(await renderGuest({ id: "m.p", render: () => null }), { html: "" });
  const el = { nodeType: 1 };
  assert.deepEqual(await renderGuest({ id: "m.p", render: () => el }), { element: el });
  assert.deepEqual(await renderGuest({ id: "m.p", render: () => ({ nodeType: 11 }) }), { element: { nodeType: 11 } });
  assert.deepEqual(await renderGuest({ id: "m.p", render: () => { throw new Error("nope"); } }), { error: "nope" });
  assert.deepEqual(await renderGuest({ id: "m.p", render: () => Promise.reject(new Error("late")) }), { error: "late" });
  assert.match(/** @type {any} */ (await renderGuest({ id: "m.p", render: () => 5 })).error, /returned number/);
  assert.match(/** @type {any} */ (await renderGuest({ id: "m.p", render: () => [] })).error, /returned an array/);
  const t0 = Date.now();
  const slow = await renderGuest({ id: "m.p", render: () => new Promise(r => setTimeout(() => r("<p>"), 500)) }, {}, { timeoutMs: 30 });
  assert.match(/** @type {any} */ (slow).error, /took longer than/); assert.ok(Date.now() - t0 < 400);
});

test("activateGuest: none, ok, throw and reject", async () => {
  assert.deepEqual(await activateGuest({ id: "m.p" }), { ok: true });
  let got;
  assert.deepEqual(await activateGuest({ id: "m.p", activate: c => { got = c; } }, { element: 1 }), { ok: true });
  assert.ok(Object.isFrozen(got)); assert.equal(got.element, 1);
  assert.deepEqual(await activateGuest({ id: "m.p", activate: () => { throw new Error("a"); } }), { error: "a" });
  assert.deepEqual(await activateGuest({ id: "m.p", activate: async () => { throw new Error("b"); } }), { error: "b" });
});
