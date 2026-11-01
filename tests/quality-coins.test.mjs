import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as Core from "../src/index.mjs";
import { QUALITIES, QUALITY_KEYS, quality, qualityLabel, itemSlot, COIN_RATIO, toCopper, fromCopper, formatCoins, coins } from "../src/index.mjs";
import { UI_STYLESHEET } from "../src/ui-model.mjs";

const css = readFileSync(new URL(`../src/${UI_STYLESHEET}`, import.meta.url), "utf8");

test("the index exports quality and coin helpers", () => {
  for (const n of ["QUALITIES", "QUALITY_KEYS", "quality", "qualityLabel", "itemSlot", "COIN_RATIO", "toCopper", "fromCopper", "formatCoins", "coins"]) assert.ok(n in Core, n);
});

test("quality maps dnd5e rarities", () => {
  const cases = { "": "poor", mundane: "poor", common: "common", uncommon: "uncommon", rare: "rare", veryRare: "epic", legendary: "legendary", artifact: "artifact" };
  for (const [r, q] of Object.entries(cases)) assert.equal(quality(r), q, r);
  assert.equal(quality("Very Rare"), "epic");
  assert.equal(quality("very_rare"), "epic");
  assert.equal(quality("EPIC"), "epic");
  assert.equal(quality(null), "poor");
  assert.equal(quality(undefined), "poor");
  assert.equal(quality("homebrew"), "common");
  assert.equal(quality("toString"), "common");
  assert.equal(quality(5), "poor");
});

test("QUALITIES is a frozen ordered list and every key has tokens and classes in the stylesheet", () => {
  assert.deepEqual([...QUALITY_KEYS], ["poor", "common", "uncommon", "rare", "epic", "legendary", "artifact"]);
  assert.ok(Object.isFrozen(QUALITIES) && Object.isFrozen(QUALITIES[0]));
  for (const { key, label } of QUALITIES) {
    assert.ok(css.includes(`--wc-q-${key}:`), key);
    assert.ok(css.includes(`.wc-q-${key}`) && css.includes(`data-quality="${key}"`), key);
    assert.equal(qualityLabel(key), label);
  }
  assert.equal(qualityLabel("veryRare"), "Epic");
  // light-theme overrides for every quality, both selector forms
  for (const sel of ["body.theme-light .wc-ui.wc-r3 {", "body .wc-ui.wc-r3.theme-light {"]) {
    const i = css.indexOf(sel); const block = css.slice(i, css.indexOf("}", i));
    for (const { key } of QUALITIES) assert.match(block, new RegExp(`--wc-q-${key}: color-mix`), `${sel} ${key}`);
  }
});

test("itemSlot: empty, filled, escaped", () => {
  assert.match(itemSlot(), /^<span class="wc-item-slot wc-empty"><span class="wc-sr">Empty slot<\/span><\/span>$/);
  const h = itemSlot({ img: `a"b.webp`, rarity: "veryRare", name: "Ring <1>", count: 3, size: "lg", cls: `x" y` });
  assert.match(h, /^<span class="wc-item-slot wc-lg x&quot; y" data-quality="epic" title="Ring &lt;1&gt;"><img src="a&quot;b\.webp" alt="Ring &lt;1&gt;" loading="lazy">/);
  assert.match(h, /<span class="wc-sr">Epic<\/span><span class="wc-slot-count">3<\/span><\/span>$/);
  assert.doesNotMatch(itemSlot({ img: "i.webp", count: 1 }), /wc-slot-count/);
  assert.match(itemSlot({ img: "i.webp", quality: "legendary", rarity: "rare" }), /data-quality="legendary"/);
  assert.match(itemSlot({ img: "i.webp" }), /data-quality="poor"/);
});

test("toCopper and fromCopper use 100 copper to the silver and 100 silver to the gold by default", () => {
  assert.equal(COIN_RATIO, 100);
  assert.equal(toCopper({ gp: 12, sp: 46, cp: 8 }), 124608);
  assert.deepEqual(fromCopper(124608), { gp: 12, sp: 46, cp: 8 });
  assert.equal(toCopper({ gp: 1 }), 10000);
  assert.equal(toCopper({ sp: 1 }), 100);
  assert.equal(toCopper({ gp: 0.5, cp: "3" }), 5003);
  assert.equal(toCopper({ gp: -5 }), 0);
  assert.equal(toCopper(null), 0);
  assert.equal(toCopper({ gp: "x", sp: NaN }), 0);
  assert.deepEqual(fromCopper(-4), { gp: 0, sp: 0, cp: 0 });
  assert.deepEqual(fromCopper(12.6), { gp: 0, sp: 0, cp: 13 });
  assert.deepEqual(fromCopper(NaN), { gp: 0, sp: 0, cp: 0 });
  for (const n of [0, 1, 99, 100, 9999, 10000, 10001, 987654]) assert.equal(toCopper(fromCopper(n)), n);
});

test("the ratio is a parameter", () => {
  assert.equal(toCopper({ gp: 1 }, { ratio: 10 }), 100);
  assert.deepEqual(fromCopper(123, { ratio: 10 }), { gp: 1, sp: 2, cp: 3 });
  assert.equal(formatCoins(123, { ratio: 10 }), "1g 2s 3c");
  assert.equal(toCopper({ gp: 1 }, { ratio: 0 }), 10000, "a bad ratio falls back to the default");
  assert.equal(toCopper({ gp: 1 }, { ratio: /** @type {any} */ ("x") }), 10000);
});

test("formatCoins", () => {
  assert.equal(formatCoins(124608), "12g 46s 8c");
  assert.equal(formatCoins({ gp: 12, sp: 46, cp: 8 }), "12g 46s 8c");
  assert.equal(formatCoins(10005), "1g 5c");
  assert.equal(formatCoins(10005, { zero: true }), "1g 0s 5c");
  assert.equal(formatCoins(0), "0c");
  assert.equal(formatCoins(0, { style: "long" }), "0 copper");
  assert.equal(formatCoins(124608, { style: "long" }), "12 gold, 46 silver, 8 copper");
  assert.equal(formatCoins({ sp: 120 }), "1g 20s", "a purse is normalised");
  assert.equal(formatCoins({ gp: 1, sp: 20, cp: 5 }, { style: "short" }), "1g 20s 5c");
  assert.equal(formatCoins(-5), "0c");
  assert.equal(formatCoins(/** @type {any} */ (undefined)), "0c");
});

test("coins markup escapes and describes each part", () => {
  const h = coins(124608);
  assert.match(h, /^<span class="wc-coins" title="12 gold, 46 silver, 8 copper">/);
  assert.equal(h.match(/class="wc-coin-icon" aria-hidden="true"/g).length, 3);
  assert.match(h, /<span class="wc-coin wc-coin-gp"><span class="wc-coin-icon" aria-hidden="true"><\/span>12<span class="wc-sr">gold<\/span><\/span>/);
  assert.doesNotMatch(coins(10005), /wc-coin-sp/);
  assert.match(coins(10005, { zero: true }), /wc-coin-sp wc-zero/);
  assert.match(coins(0), /wc-coin-cp wc-zero/);
  assert.match(coins(5, { cls: `a" onclick="x` }), /class="wc-coins a&quot; onclick=&quot;x"/);
  assert.equal(coins({ gp: 1 }, { ratio: 10 }).includes(">1<"), true);
});
