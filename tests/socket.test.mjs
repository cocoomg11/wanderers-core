import { test } from "node:test";
import assert from "node:assert/strict";
import { defineRequests, readRequest, makeRequest, jsonBytes, MAX_BYTES } from "../src/socket-model.mjs";

const S = defineRequests({
  note: { fields: { text: { type: "string", max: 200 }, thread: { type: "boolean", optional: true } } },
  pin: {
    fields: {
      sceneId: { type: "id" }, x: { type: "number", min: 0 }, y: { type: "number", min: 0 }, op: { type: "string", oneOf: ["create", "move"] },
      tags: { type: "array", of: { type: "string", max: 20 }, max: 3, optional: true },
      link: { type: "uuid", optional: true },
      style: { type: "object", optional: true, fields: { size: { type: "number", int: true, min: 1, max: 5 } } }
    }
  },
  small: { fields: { blob: { type: "string", max: 100000 } }, maxBytes: 100 },
  loose: { fields: { a: { type: "number" } }, extra: "drop" }
});
const req = (kind, data, ...r) => ({ action: "request", kind, rid: r.length ? r[0] : "abcd-1-xyz", data });

test("a well-formed request is read, optional fields left out", () => {
  assert.deepEqual(readRequest(S, req("note", { text: "hi" })), { ok: true, kind: "note", rid: "abcd-1-xyz", data: { text: "hi" } });
  const r = readRequest(S, req("pin", { sceneId: "AbCdEfGh12345678", x: 1, y: 2, op: "move", tags: ["a"], link: "Scene.AbCdEfGh12345678.Note.x", style: { size: 2 } }));
  assert.equal(r.ok, true);
});
test("unknown kinds and non-requests are refused", () => {
  assert.equal(readRequest(S, req("steal", {})).ok, false);
  assert.match(readRequest(S, req("toString", {})).reason, /unknown request kind/, "inherited names are not kinds");
  assert.equal(readRequest(S, { action: "hook", kind: "note" }).ok, false);
  assert.equal(readRequest(S, null).ok, false); assert.equal(readRequest(S, [1]).ok, false); assert.equal(readRequest(S, "x").ok, false);
});
test("a missing or malformed rid is refused", () => {
  for (const rid of [undefined, "", "a b c d", "x", 12, "y".repeat(65)]) {
    const r = readRequest(S, req("note", { text: "hi" }, rid));
    assert.equal(r.ok, false, String(rid)); assert.match(r.reason, /request id/);
  }
});
test("wrong types are refused with the field named", () => {
  const cases = [
    [{ text: 5 }, /data.text should be text/],
    [{ text: "x".repeat(201) }, /longer than 200/],
    [{ text: "ok", thread: "yes" }, /data.thread should be true or false/],
    [{}, /data.text is missing/],
    [{ text: "ok", userId: "GM" }, /data.userId isn't expected/]
  ];
  for (const [data, re] of cases) assert.match(readRequest(S, req("note", data)).reason, re);
  const pin = d => readRequest(S, req("pin", { sceneId: "AbCdEfGh12345678", x: 1, y: 2, op: "create", ...d })).reason ?? "ok";
  assert.match(pin({ sceneId: "short" }), /document id/);
  assert.match(pin({ x: NaN }), /number/); assert.match(pin({ x: Infinity }), /number/); assert.match(pin({ y: -1 }), /at least 0/);
  assert.match(pin({ op: "delete" }), /one of create, move/);
  assert.match(pin({ tags: ["a", "b", "c", "d"] }), /more than 3 items/);
  assert.match(pin({ tags: ["a", 1] }), /tags\[1\] should be text/);
  assert.match(pin({ link: "no dots here" }), /UUID/);
  assert.match(pin({ style: { size: 1.5 } }), /whole number/);
  assert.match(pin({ style: [] }), /should be an object/);
  assert.equal(pin({}), "ok");
});
test("oversized payloads are refused before the fields are read", () => {
  const r = readRequest(S, req("small", { blob: "x".repeat(200) }));
  assert.equal(r.ok, false); assert.match(r.reason, /payload too large/); assert.equal(r.kind, "small"); assert.equal(r.rid, "abcd-1-xyz");
  assert.match(readRequest(S, req("note", { text: "x".repeat(MAX_BYTES) })).reason, /too large/);
});
test("cyclic, deep and odd payloads never throw", () => {
  const cyc = { text: "a" }; cyc.self = cyc;
  assert.equal(readRequest(S, req("note", cyc)).ok, false);
  assert.equal(jsonBytes(cyc), Infinity);
  assert.equal(readRequest(S, req("note", Object.create({ text: "inherited" }))).ok, false);
  assert.equal(readRequest(S, req("note", { text: "a", __proto__: { evil: 1 } })).ok, false, "only plain objects");
  const parsed = JSON.parse('{"text":"a","__proto__":{"polluted":1}}');
  assert.match(readRequest(S, req("note", parsed)).reason, /__proto__ isn't expected/);
  const dropped = readRequest(S, req("loose", JSON.parse('{"a":1,"__proto__":{"polluted":1}}')));
  assert.deepEqual(dropped.data, { a: 1 }); assert.equal(({}).polluted, undefined);
});
test("extra: drop keeps only known fields", () => {
  assert.deepEqual(readRequest(S, req("loose", { a: 1, b: 2 })).data, { a: 1 });
});
test("makeRequest checks on the sending side", () => {
  assert.deepEqual(makeRequest(S, "note", "abcd-2", { text: "x" }), { action: "request", kind: "note", rid: "abcd-2", data: { text: "x" } });
  assert.throws(() => makeRequest(S, "note", "abcd-2", { text: 1 }), /data.text/);
  assert.throws(() => makeRequest(S, "nope", "abcd-2", {}), /unknown/);
});
test("defineRequests catches schema mistakes", () => {
  assert.throws(() => defineRequests({ "bad kind!": { fields: {} } }));
  assert.throws(() => defineRequests({ k: { fields: { a: { type: "date" } } } }));
  assert.throws(() => defineRequests({ k: { fields: { a: { type: "array" } } } }));
  assert.throws(() => defineRequests({ k: { fields: {}, from: "player" } }));
  assert.ok(Object.isFrozen(S));
});
