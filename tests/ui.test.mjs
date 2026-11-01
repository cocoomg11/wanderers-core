import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as Core from "../src/index.mjs";
import { UI_REVISION, UI_CLASSES, UI_STYLESHEET, TONES, tone, icon, badge, dot, statusLine, statusLines, navItem } from "../src/ui-model.mjs";
import { buildBundle } from "../tools/vendor.mjs";

const CSS_URL = new URL(`../src/${UI_STYLESHEET}`, import.meta.url);
const css = readFileSync(CSS_URL, "utf8");
const ROOT = `.wc-ui.wc-r${UI_REVISION}`;

/**
 * The stylesheet's hash for each revision. Changing the file changes its hash: bump UI_REVISION (and every wc-r<N> in the file),
 * then add the new hash here. A shipped revision's hash never changes.
 */
const REVISION_HASHES = {
  1: "16f473dfccab45973abae9ee5b9243911aa9eb28a4f92dc899f96200303b4efd"
};

/** Selectors of every style rule (comments and at-rule preludes removed). */
function selectors(text) {
  const out = [];
  const body = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body))) {
    const sel = m[1].trim().replace(/^@[^{]*$/, "");
    if (!sel || /^(from|to|\d+%)/.test(sel)) continue;
    out.push(...sel.split(/,(?![^(]*\))/).map(s => s.trim().replace(/^@[a-z-]+[^{]*?\)\s*/, "")).filter(Boolean));
  }
  return out;
}

test("the index exports the UI helpers", () => {
  for (const n of ["UI_REVISION", "UI_CLASSES", "UI_STYLESHEET", "TONES", "tone", "icon", "badge", "dot", "statusLine", "statusLines", "navItem"]) {
    assert.ok(n in Core, n);
  }
  assert.deepEqual([...UI_CLASSES], ["wc-ui", `wc-r${UI_REVISION}`]);
});

test("every rule is scoped under the revision root; no :root, html or bare element rules", () => {
  const sels = selectors(css);
  assert.ok(sels.length > 50);
  const allowed = new RegExp(`^(body(\\.theme-(dark|light))? )?${ROOT.replace(/\./g, "\\.")}(?=[\\s.:\\[]|$)`);
  for (const s of sels) assert.match(s, allowed, s);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /:root|(^|[\s,}])html[\s{.,]/m);
});

test("keyframes and container names carry the revision; tokens are defined only on the root", () => {
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) assert.ok(name.startsWith(`wc-r${UI_REVISION}-`), name);
  for (const [, name] of css.matchAll(/animation(?:-name)?:\s*([\w-]+)/g)) if (name !== "none") assert.ok(name.startsWith(`wc-r${UI_REVISION}-`), name);
  for (const [, name] of css.matchAll(/@container\s+([\w-]+)/g)) assert.equal(name, `wc-r${UI_REVISION}`);
  for (const [, name] of css.matchAll(/container:\s*([\w-]+)/g)) assert.equal(name, `wc-r${UI_REVISION}`);
  for (const [, n] of css.matchAll(/wc-r(\d+)/g)) assert.equal(Number(n), UI_REVISION, "every revision class in the file is the current one");
});

test("no hard-coded colours outside var() fallbacks", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const noFallbacks = body.replace(/var\(--[\w-]+,\s*#[0-9a-f]{3,8}\)/gi, "");
  assert.doesNotMatch(noFallbacks, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(noFallbacks, /\brgba?\(|\bhsla?\(/i);
  assert.match(body, /--color-level-success/);
  assert.match(body, /prefers-reduced-motion/);
});

test("a changed stylesheet needs a new revision", () => {
  const hash = createHash("sha256").update(css.replace(/\r\n?/g, "\n"), "utf8").digest("hex");
  assert.equal(REVISION_HASHES[UI_REVISION], hash, `styles changed: bump UI_REVISION (now ${UI_REVISION}) and record the new hash`);
});

test("the stylesheet ships in the vendored bundle at vendor/wanderers-core/styles/", () => {
  const b = buildBundle(new URL("..", import.meta.url).pathname);
  assert.ok(UI_STYLESHEET in b.files, Object.keys(b.files).join(", "));
});

test("tone reads tones, levels and aliases; unknown is info", () => {
  assert.equal(tone("live"), "live");
  assert.equal(tone("pending"), "pending");
  assert.equal(tone("error"), "bad");
  assert.equal(tone("WARNING"), "warn");
  assert.equal(tone("nope"), "info");
  assert.equal(tone(undefined), "info");
  assert.equal(tone("toString"), "info");
  assert.ok(Object.isFrozen(TONES));
});

test("icon has a screen-reader word and no status characters", () => {
  assert.equal(icon("ok"), `<i class="fa-solid fa-circle-check wc-icon wc-ok" aria-hidden="true"></i><span class="wc-sr">OK:</span>`);
  assert.doesNotMatch(icon("bad", { word: false }), /wc-sr/);
  assert.match(icon("warn", { word: `<b>` }), /&lt;b&gt;:/);
  for (const t of Object.keys(TONES)) assert.doesNotMatch(icon(t) + badge(t, "x", { icon: true }) + statusLine(t, "x"), /[✓✔⚠✗✘❌]/u);
});

test("badge, dot and status lines escape every value", () => {
  assert.equal(badge("warn", "3 <b>", { small: true, title: `a"b` }), `<span class="wc-badge wc-warn wc-badge-sm" title="a&quot;b">3 &lt;b&gt;</span>`);
  assert.match(badge("live", "Recording", { dot: true }), /^<span class="wc-badge wc-live"><span class="wc-dot wc-live" aria-hidden="true"><\/span>Recording/);
  assert.match(badge("ok", "x", { cls: `a" onclick="x` }), /class="wc-badge wc-ok a&quot; onclick=&quot;x"/);
  assert.equal(dot("pending"), `<span class="wc-dot wc-pending" aria-hidden="true"></span>`);
  assert.match(dot("ok", { label: "health <OK>" }), /<span class="wc-sr">health &lt;OK&gt;<\/span>$/);
  assert.match(statusLine("bad", "<img>"), /^<li class="wc-status wc-bad"><i [^>]+><\/i><span class="wc-sr">Problem:<\/span><span class="wc-grow">&lt;img&gt;<\/span><\/li>$/);
  assert.match(statusLine("ok", "x", { tag: "p" }), /^<p /);
  assert.match(statusLine("ok", "x", { tag: /** @type {any} */ ("script") }), /^<li /);
  const lines = statusLines([{ level: "error", text: "a" }, { text: "b" }, null]);
  assert.match(lines, /^<ul class="wc-lines"><li class="wc-status wc-bad">/);
  assert.equal(lines.match(/<li /g).length, 3);
  assert.equal(statusLines(/** @type {any} */ ("x")), `<ul class="wc-lines"></ul>`);
});

test("navItem builds an accessible sidebar link", () => {
  const html = navItem({ label: "Scene <check>", page: "scenes", icon: "fa-solid fa-list", badge: { tone: "warn", text: 3 }, active: true, tabindex: 0, aria: "Scene check, 3 warnings" });
  assert.match(html, /^<button type="button" class="wc-nav active" data-action="nav" data-page="scenes" aria-current="page" tabindex="0" aria-label="Scene check, 3 warnings">/);
  assert.match(html, /<span class="wc-nav-label">Scene &lt;check&gt;<\/span><span class="wc-badge wc-warn wc-badge-sm">3<\/span><\/button>$/);
  const muted = navItem({ label: "Off", dot: "off", muted: true, action: "go", data: { id: `x"y`, "Bad Key": "z" }, tabindex: -1 });
  assert.match(muted, /class="wc-nav wc-muted" data-action="go" data-id="x&quot;y" tabindex="-1">/);
  assert.doesNotMatch(muted, /Bad Key|aria-current/);
  assert.match(muted, /<span class="wc-dot wc-off"/);
});
