import assert from "node:assert/strict";
import test from "node:test";
import { decideEnter } from "@/lib/enter-next-field";
import {
  chooseSavedNameOnEnter,
  distinctContractPlaces,
  matchingContractPlaces,
} from "@/lib/contract-place-names";

const contracts = [
  { city: "Pune", state: "Maharashtra" },
  { city: "Pune", state: "Maharashtra" },
  { city: "  ", state: "" },
  { city: "pune", state: "Goa" },
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Jaipur", state: "Rajasthan" },
];

test("city and state names come from contract fields and keep each spelling", () => {
  assert.deepEqual(distinctContractPlaces(contracts, "city"), [
    "Bengaluru",
    "Jaipur",
    "Pune",
    "pune",
  ]);
  assert.deepEqual(distinctContractPlaces(contracts, "state"), [
    "Goa",
    "Karnataka",
    "Maharashtra",
    "Rajasthan",
  ]);
  assert.deepEqual(distinctContractPlaces([], "city"), []);
});

test("typing matches that field only and does not choose a name by itself", () => {
  const cities = distinctContractPlaces(contracts, "city");
  assert.deepEqual(matchingContractPlaces(cities, ""), []);
  assert.deepEqual(matchingContractPlaces(cities, "   "), []);
  assert.deepEqual(matchingContractPlaces(cities, "pu"), ["Pune", "pune"]);
  assert.deepEqual(matchingContractPlaces(cities, "jai"), ["Jaipur"]);
  assert.deepEqual(matchingContractPlaces(cities, "Pune"), ["pune"]);
  assert.deepEqual(matchingContractPlaces(cities, "goa"), []);
  assert.deepEqual(
    matchingContractPlaces(distinctContractPlaces(contracts, "state"), "ma"),
    ["Maharashtra"]
  );
});

test("a new city saved on a contract is a match on the next contract", () => {
  const before = distinctContractPlaces(contracts, "city");
  assert.deepEqual(matchingContractPlaces(before, "Mys"), []);
  const afterSave = distinctContractPlaces(
    [...contracts, { city: "Mysuru", state: "Karnataka" }],
    "city"
  );
  assert.deepEqual(matchingContractPlaces(afterSave, "Mys"), ["Mysuru"]);
  assert.equal(afterSave.includes("Mysuru"), true);
});

test("Enter chooses only a highlighted open match and otherwise does not save", () => {
  assert.equal(chooseSavedNameOnEnter(true, true), true);
  assert.equal(chooseSavedNameOnEnter(true, false), false);
  assert.equal(chooseSavedNameOnEnter(false, false), false);
  assert.equal(chooseSavedNameOnEnter(false, true), false);

  const field = {
    composing: false,
    isSave: false,
    selectOpen: false,
    inListbox: false,
  };
  assert.equal(decideEnter({ ...field, key: "Enter", tag: "INPUT" }), "next");
  assert.equal(
    decideEnter({ ...field, key: "Enter", tag: "BUTTON", isSave: true }),
    "block-save"
  );
});
