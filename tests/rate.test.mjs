import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimiter, RATE_BURST } from "../src/rate-model.mjs";

test("token bucket: a burst goes through, then one per refill", () => {
  const r = rateLimiter({ burst: 3, perSecond: 2 });
  assert.equal(r.take("u", 0), true); assert.equal(r.take("u", 0), true); assert.equal(r.take("u", 0), true);
  assert.equal(r.take("u", 0), false, "empty bucket refuses");
  assert.equal(r.take("other", 0), true, "each user has a bucket of their own");
  assert.equal(r.take("u", 400), false, "0.8 of a token is not enough");
  assert.equal(r.take("u", 500), true, "one token back after half a second");
  assert.equal(r.left("u", 10_000), 3, "refills up to the burst, no further");
});
test("token bucket: defaults, key cap and bad configuration", () => {
  const r = rateLimiter({ maxKeys: 2 });
  for (let i = 0; i < RATE_BURST; i++) assert.equal(r.take("u", 0), true);
  assert.equal(r.take("u", 0), false);
  r.take("a", 0); r.take("b", 0);
  assert.equal(r.size, 2);
  assert.equal(r.left("u", 0), RATE_BURST, "a forgotten key starts full");
  assert.equal(r.take("u", -5000), true, "a clock that goes back doesn't break it");
  r.clear(); assert.equal(r.size, 0);
  assert.throws(() => rateLimiter({ burst: 0 })); assert.throws(() => rateLimiter({ perSecond: 0 })); assert.throws(() => rateLimiter({ burst: NaN }));
});
