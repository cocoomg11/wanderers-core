import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "../src/leader-model.mjs";

const gm = "gmUser";
test("earliest-started session of the active GM user leads", () => {
  const self = { id: "bbbb", userId: gm, since: 200 };
  const peers = [{ id: "aaaa", userId: gm, since: 100, seen: 1000 }, { id: "cccc", userId: gm, since: 50, seen: 1000 }];
  assert.equal(M.leaderOf(peers, { gmUserId: gm, self }), "cccc");
  assert.equal(M.isLeader(peers, { gmUserId: gm, self }), false);
});
test("ties break on the lowest id", () => {
  assert.equal(M.leaderOf([{ id: "zzzz", userId: gm, since: 1, seen: 9 }], { gmUserId: gm, self: { id: "aaaa", userId: gm, since: 1 } }), "aaaa");
});
test("a lone client leads; a non-active GM never does", () => {
  assert.equal(M.isLeader([], { gmUserId: gm, self: { id: "solo", userId: gm, since: 5 } }), true);
  assert.equal(M.isLeader([], { gmUserId: gm, self: { id: "solo", userId: "otherGM", since: 5 } }), false);
  assert.equal(M.leaderOf([], { gmUserId: null }), null);
});
test("other users' sessions don't count", () => {
  assert.equal(M.leaderOf([{ id: "early", userId: "gm2", since: 1, seen: 9 }], { gmUserId: gm, self: { id: "late", userId: gm, since: 9 } }), "late");
});
test("a peer that missed a ping drops out; one that answered stays", () => {
  const cut = M.aliveCutoff(10000, 1000);
  const peers = [{ id: "old1", userId: gm, since: 1, seen: 8500 }, { id: "ok22", userId: gm, since: 2, seen: 9500 }];
  assert.equal(M.leaderOf(peers, { gmUserId: gm, cutoff: cut, self: { id: "me33", userId: gm, since: 3 } }), "ok22");
  assert.equal(M.prune(peers, cut).length, 1);
  assert.equal(M.aliveCutoff(null), -Infinity);
});
test("bye hands over at once; ping/here update the table", () => {
  let t = M.applySessionMessage([], M.readSessionMessage({ action: "leader", op: "ping", sid: "lead1", since: 1 }), gm, 50);
  t = M.applySessionMessage(t, M.readSessionMessage({ action: "leader", op: "here", sid: "next2", since: 2 }), gm, 60);
  assert.equal(M.leaderOf(t, { gmUserId: gm, self: { id: "me333", userId: gm, since: 3 } }), "lead1");
  t = M.applySessionMessage(t, M.readSessionMessage({ action: "leader", op: "bye", sid: "lead1" }), gm, 70);
  assert.equal(M.leaderOf(t, { gmUserId: gm, self: { id: "me333", userId: gm, since: 3 } }), "next2");
});
test("the sender id comes from Foundry, not the message", () => {
  const m = M.readSessionMessage({ action: "leader", op: "ping", sid: "abcd", since: 1, userId: "spoofed" });
  assert.equal(M.applySessionMessage([], m, "realUser", 5)[0].userId, "realUser");
  assert.deepEqual(M.applySessionMessage([], m, null, 5), []);
});
test("bad session messages are ignored", () => {
  assert.equal(M.readSessionMessage({ action: "leader", op: "steal", sid: "abcd" }), null);
  assert.equal(M.readSessionMessage({ action: "leader", op: "ping", sid: "<x>" }), null);
  assert.equal(M.readSessionMessage({ action: "other", op: "ping", sid: "abcd" }), null);
  assert.equal(M.readSessionMessage("leader"), null);
  assert.deepEqual(M.readSessionMessage({ action: "leader", op: "ping", sid: "abcd", since: "x" }), { op: "ping", sid: "abcd", since: 0 });
});
test("active GM pick", () => {
  const users = [{ id: "b", isGM: true, active: true }, { id: "a", isGM: true, active: true }, { id: "0", isGM: true, active: false }];
  assert.equal(M.pickActiveGM(users).id, "a");
  assert.equal(M.pickActiveGM(users, users[0]).id, "b");
  assert.equal(M.pickActiveGM(users, users[2]).id, "a", "an inactive declared GM is ignored");
  assert.equal(M.pickActiveGM([{ id: "p", isGM: false, active: true }]), null);
});
test("request de-dup: repeats are skipped, cache is capped", () => {
  const c = M.seenCache(3);
  assert.equal(c.firstTime("r1"), true); assert.equal(c.firstTime("r1"), false);
  c.firstTime("r2"); c.firstTime("r3"); c.firstTime("r4");
  assert.equal(c.size, 3); assert.equal(c.has("r1"), false); assert.equal(c.firstTime(undefined), true);
  assert.equal(M.requestId({ rid: "abcd-1" }), "abcd-1"); assert.equal(M.requestId({ rid: "a b" }), null); assert.equal(M.requestId(null), null);
});
test("ids", () => {
  assert.match(M.newId(() => 0.5), /^[A-Za-z0-9]{16}$/);
  assert.ok(M.compareSessions({ id: "b", userId: "", since: 1 }, { id: "a", userId: "", since: 2 }) < 0);
  const rid = M.makeRequestId("ab", 7, 1000);
  assert.match(rid, M.ID_RE); assert.ok(rid.startsWith("abxx-7-"));
  assert.ok(M.makeRequestId("x".repeat(100), 1).length <= 64);
});

test("request ids: only ids in makeRequestId's shape parse", () => {
  const rid = M.makeRequestId("Session1234abcd", 12, 1_700_000_000_000);
  assert.deepEqual(M.parseRequestId(rid), { prefix: "Session1234abcd", n: 12, time: 1_700_000_000_000 });
  for (const bad of ["abcd", "abcd-1", "ab-1-x", "abcd-x-1", "abcd-1-X!", "a b-1-2", 5, null, "abcd-1-" + "z".repeat(13)]) {
    assert.equal(M.parseRequestId(bad), null, String(bad));
  }
});

test("broadcast hooks: only from the leader's session of a known GM user", () => {
  const names = new Set(["mod-a.done"]);
  const gmU = { id: "gm1", isGM: true }, other = { id: "gm2", isGM: true }, pl = { id: "pl1", isGM: false };
  const leader = { id: "lead1", userId: "gm1", since: 1 };
  const m = M.readHookMessage({ action: "hook", name: "mod-a.done", sid: "lead1", payload: { a: 1 }, userId: "gm1" });
  assert.deepEqual(m, { name: "mod-a.done", sid: "lead1", payload: { a: 1 } });
  assert.equal(M.acceptHook(m, { sender: gmU, leader, names }).ok, true);
  assert.match(M.acceptHook(m, { sender: null, leader, names }).reason, /unknown user/, "an unknown sender is refused");
  assert.match(M.acceptHook(m, { sender: pl, leader, names }).reason, /player/);
  assert.match(M.acceptHook(m, { sender: other, leader, names }).reason, /isn't the leader/, "another GM can't borrow the leader's sid");
  assert.match(M.acceptHook(m, { sender: gmU, leader: null, names }).reason, /isn't the leader/);
  assert.match(M.acceptHook({ ...m, sid: "tab2x" }, { sender: gmU, leader, names }).reason, /isn't the leader/, "a second tab of the GM isn't the leader");
  assert.match(M.acceptHook({ ...m, name: "mod-b.x" }, { sender: gmU, leader, names }).reason, /isn't one of/);
  assert.equal(M.acceptHook(null, { sender: gmU, leader, names }).ok, false);
  assert.equal(M.readHookMessage({ action: "hook", name: "mod-a.done" }), null, "no session id");
  assert.equal(M.readHookMessage({ action: "hook", name: "", sid: "lead1" }), null);
});
