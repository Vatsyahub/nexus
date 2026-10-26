import assert from "node:assert/strict";
import test from "node:test";
import {
  ITEM_NAME_MATCH_LIMIT,
  matchingItemNames,
} from "@/lib/item-name-matches";

const cradle = { name: "Cradle - Two Man" };

test("two, cradle, and man find Cradle - Two Man", () => {
  const items = [
    { name: "Tower bolt" },
    cradle,
    { name: "Cradle-Two-Man spare" },
    { name: "Manual hoist" },
    { name: "Single cradle" },
  ];

  for (const query of ["two", "cradle", "man"]) {
    const names = matchingItemNames(items, query).map((item) => item.name);
    assert.ok(names.includes("Cradle - Two Man"), query);
  }

  assert.deepEqual(
    matchingItemNames(items, "TWO").map((item) => item.name),
    ["Cradle - Two Man", "Cradle-Two-Man spare"]
  );
  assert.deepEqual(
    matchingItemNames(items, "man").map((item) => item.name),
    ["Cradle - Two Man", "Cradle-Two-Man spare", "Manual hoist"]
  );
  assert.deepEqual(matchingItemNames(items, "adle"), []);
  assert.deepEqual(matchingItemNames(items, "two man"), []);
});

test("an empty item query returns no matches", () => {
  assert.deepEqual(matchingItemNames([cradle], ""), []);
  assert.deepEqual(matchingItemNames([cradle], "   "), []);
});

test("an item query returns at most 5 matches", () => {
  assert.equal(ITEM_NAME_MATCH_LIMIT, 5);
  const items = Array.from({ length: 8 }, (_, index) => ({
    name: `Panel ${index}`,
  }));
  const matches = matchingItemNames(items, "panel");
  assert.equal(matches.length, 5);
  assert.deepEqual(
    matches.map((item) => item.name),
    items.slice(0, 5).map((item) => item.name)
  );

  const fewer = matchingItemNames([cradle, { name: "Tower" }], "cradle");
  assert.deepEqual(
    fewer.map((item) => item.name),
    ["Cradle - Two Man"]
  );
  assert.ok(fewer.length <= 5);
});
