import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as V from "../tools/vendor.mjs";

const CORE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TOOL = join(CORE, "tools", "vendor.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "wcore-"));
const run = (cwd, ...args) => spawnSync(process.execPath, [TOOL, ...args], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "" } });

test("the hash ignores line endings and order, and sees every change", () => {
  const a = V.hashFiles({ "a.mjs": "x\ny\n", "b/c.mjs": "z" });
  assert.equal(V.hashFiles({ "b/c.mjs": "z", "a.mjs": "x\r\ny\r\n" }), a);
  assert.notEqual(V.hashFiles({ "a.mjs": "x\ny", "b/c.mjs": "z" }), a);
  assert.notEqual(V.hashFiles({ "a.mjs": "x\ny\n", "b/d.mjs": "z" }), a, "a rename changes the hash");
  assert.notEqual(V.hashFiles({ "a.mjs": "x\ny\n", "b/c.mjs": "z", "extra.mjs": "" }), a);
  assert.match(a, /^sha256-[0-9a-f]{64}$/);
});
test("unsafe bundle paths are refused", () => {
  for (const p of ["../x.mjs", "/abs.mjs", "a/../../b", "a\\b.mjs", "", ".hidden", "a//b"]) assert.ok(V.checkPaths({ [p]: "x" }).length, JSON.stringify(p));
  assert.deepEqual(V.checkPaths({ "src/a.mjs": "x", "LICENSE": "y" }), []);
  assert.ok(V.checkPaths({}).length);
  assert.ok(V.checkPaths({ "a.mjs": 5 }).length);
});
test("the bundle holds src, config, the tool and the licence, and checks itself", () => {
  const b = V.buildBundle(CORE);
  assert.equal(b.version, JSON.parse(readFileSync(join(CORE, "package.json"), "utf8")).version);
  for (const p of ["index.mjs", "socket-model.mjs", "window-model.mjs", "keybinding-model.mjs", "foundry/leader.mjs", "foundry/window.mjs", "foundry/keybinding.mjs", "config/eslint.base.mjs", "vendor.mjs", "LICENSE"]) assert.ok(p in b.files, p);
  assert.ok(!Object.keys(b.files).some(p => p.startsWith("tests/") || p.includes("node_modules")));
  assert.deepEqual(V.checkBundle(b, b.version), []);
  assert.match(V.checkBundle(b, "9.9.9")[0], /not 9.9.9/);
  assert.match(V.checkBundle({ ...b, files: { ...b.files, "index.mjs": "tampered" } })[0], /don't match its hash/);
  assert.ok(V.checkBundle({ name: "other" }).length);
  assert.equal(V.assetUrl("0.1.0"), "https://github.com/cocoomg11/wanderers-core/releases/download/v0.1.0/wanderers-core-0.1.0.json");
});
test("install --from pins a local copy; verify passes, then catches edits, additions and deletions", () => {
  const mod = tmp();
  try {
    let r = run(mod, "install", "--from", CORE);
    assert.equal(r.status, 0, r.stderr);
    const lock = JSON.parse(readFileSync(join(mod, V.DEFAULT_LOCK), "utf8"));
    assert.equal(lock.source, "local"); assert.equal(lock.name, "wanderers-core"); assert.equal(lock.dir, V.DEFAULT_DIR);
    assert.ok(existsSync(join(mod, V.DEFAULT_DIR, "index.mjs")));
    assert.ok(existsSync(join(mod, V.DEFAULT_DIR, "styles", "wanderers-ui.css")), "the shared stylesheet ships where module.json `styles` points");
    r = run(mod, "verify"); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /OK/);

    const file = join(mod, V.DEFAULT_DIR, "text.mjs");
    const orig = readFileSync(file, "utf8");
    writeFileSync(file, orig + "\n// local tweak\n");
    r = run(mod, "verify"); assert.equal(r.status, 1); assert.match(r.stderr, /don't match the pin/);
    writeFileSync(file, orig.replace(/\n/g, "\r\n"));
    r = run(mod, "verify"); assert.equal(r.status, 0, "CRLF checkouts still verify");
    writeFileSync(file, orig);

    writeFileSync(join(mod, V.DEFAULT_DIR, "extra.mjs"), "export {};\n");
    assert.equal(run(mod, "verify").status, 1);
    rmSync(join(mod, V.DEFAULT_DIR, "extra.mjs"));
    rmSync(join(mod, V.DEFAULT_DIR, "records.mjs"));
    assert.equal(run(mod, "verify").status, 1);

    r = run(mod, "install", "--from", CORE);
    assert.equal(r.status, 1, "an edited copy isn't replaced without --force"); assert.match(r.stderr, /--force/);
    r = run(mod, "install", "--from", CORE, "--force");
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /added 1/);
    assert.equal(run(mod, "verify").status, 0);
  } finally { rmSync(mod, { recursive: true, force: true }); }
});
test("verify fails without a lock or with a changed lock; --dir outside the module is refused", () => {
  const mod = tmp();
  try {
    assert.equal(run(mod, "verify").status, 1);
    assert.equal(run(mod, "install", "--from", CORE).status, 0);
    const lf = join(mod, V.DEFAULT_LOCK);
    const lock = JSON.parse(readFileSync(lf, "utf8"));
    writeFileSync(lf, JSON.stringify({ ...lock, version: "0.0.9" }));
    assert.equal(run(mod, "verify").status, 0, "version alone isn't the content check (the hash is)");
    writeFileSync(lf, JSON.stringify({ ...lock, hash: "sha256-" + "0".repeat(64) }));
    assert.equal(run(mod, "verify").status, 1);
    writeFileSync(lf, JSON.stringify(lock));
    const r = run(mod, "install", "--from", CORE, "--dir", "../outside", "--force");
    assert.equal(r.status, 1); assert.match(r.stderr, /outside the module folder/);
    assert.equal(run(mod, "install", "9.9.9", "--from", CORE, "--force").status, 1, "a version that doesn't match the checkout is refused");
    assert.equal(run(mod, "install", "not-a-version").status, 1);
  } finally { rmSync(mod, { recursive: true, force: true }); }
});
test("a vendored copy can verify itself and build the same bundle hash", () => {
  const mod = tmp();
  try {
    assert.equal(run(mod, "install", "--from", CORE).status, 0);
    const out = execFileSync(process.execPath, [join(mod, V.DEFAULT_DIR, "vendor.mjs"), "verify"], { cwd: mod, encoding: "utf8" });
    assert.match(out, /OK/);
    const dist = join(mod, "dist"); mkdirSync(dist);
    execFileSync(process.execPath, [TOOL, "bundle", "--out", dist], { cwd: mod });
    const b = JSON.parse(readFileSync(join(dist, `wanderers-core-${V.buildBundle(CORE).version}.json`), "utf8"));
    assert.equal(b.hash, JSON.parse(readFileSync(join(mod, V.DEFAULT_LOCK), "utf8")).hash);
  } finally { rmSync(mod, { recursive: true, force: true }); }
});
test("diff names added, removed and changed files", () => {
  assert.deepEqual(V.diff({ a: "1", b: "2" }, { b: "3", c: "4" }), { added: ["c"], removed: ["a"], changed: ["b"] });
});
