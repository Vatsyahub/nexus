import assert from "node:assert/strict";
import test from "node:test";
import {
  ADD_CONTRACT_MATCH_LIMIT,
  matchingAddContracts,
} from "@/lib/add-contract-matches";

const contracts = [
  { id: "contains-name", projectNo: "100", projectName: "River plant" },
  { id: "starts-no", projectNo: "PLANT-9", projectName: "North" },
  { id: "starts-name", projectNo: "200", projectName: "Plant room" },
  { id: "contains-no", projectNo: "X-PLANT", projectName: "West" },
  { id: "starts-no-2", projectNo: "PLANT-1", projectName: "South" },
  { id: "starts-no-3", projectNo: "PLANT-2", projectName: "East" },
  { id: "city-only", projectNo: "300", projectName: "Depot", city: "Plantville" },
];

test("an empty contract query returns no matches", () => {
  assert.deepEqual(matchingAddContracts(contracts, ""), []);
  assert.deepEqual(matchingAddContracts(contracts, "   "), []);
});

test("a contract query returns at most 3 matches, prefix before contains", () => {
  assert.equal(ADD_CONTRACT_MATCH_LIMIT, 3);
  const matches = matchingAddContracts(contracts, "plant");
  assert.ok(matches.length <= 3);
  assert.deepEqual(
    matches.map((c) => c.id),
    ["starts-no", "starts-name", "starts-no-2"]
  );
  assert.equal(matchingAddContracts(contracts, "plant").length, 3);

  const fewer = matchingAddContracts(contracts, "river");
  assert.deepEqual(
    fewer.map((c) => c.id),
    ["contains-name"]
  );
  assert.ok(fewer.length <= 3);

  const containsAfterPrefix = matchingAddContracts(
    [
      { id: "contains-first", projectNo: "10", projectName: "Has beta word" },
      { id: "name-prefix", projectNo: "B-2", projectName: "Beta yard" },
      { id: "contains-second", projectNo: "12", projectName: "the beta hall" },
      { id: "contains-third", projectNo: "13", projectName: "more beta" },
      { id: "number-prefix", projectNo: "BETA-1", projectName: "Other" },
    ],
    "BeTa"
  );
  assert.deepEqual(
    containsAfterPrefix.map((c) => c.id),
    ["name-prefix", "number-prefix", "contains-first"]
  );
  assert.equal(containsAfterPrefix.length, 3);

  const mixed = matchingAddContracts(contracts, "x-plant");
  assert.deepEqual(
    mixed.map((c) => c.id),
    ["contains-no"]
  );

  assert.deepEqual(matchingAddContracts(contracts, "goa"), []);
  assert.deepEqual(matchingAddContracts(contracts, "Plantville"), []);
});
