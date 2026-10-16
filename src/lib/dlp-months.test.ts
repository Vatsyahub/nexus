import assert from "node:assert/strict";
import test from "node:test";
import {
  DLP_MONTHS_RANGE_MESSAGE,
  acceptedDlpMonths,
} from "@/lib/dlp-months";

test("DLP accepts whole months from 3 to 60", () => {
  assert.equal(acceptedDlpMonths("3"), 3);
  assert.equal(acceptedDlpMonths(3), 3);
  assert.equal(acceptedDlpMonths("12"), 12);
  assert.equal(acceptedDlpMonths("6"), 6);
  assert.equal(acceptedDlpMonths("60"), 60);
  assert.equal(acceptedDlpMonths(60), 60);
});

test("DLP refuses months below 3, above 60, and fractions", () => {
  assert.equal(acceptedDlpMonths("2"), null);
  assert.equal(acceptedDlpMonths(2), null);
  assert.equal(acceptedDlpMonths("0"), null);
  assert.equal(acceptedDlpMonths(""), null);
  assert.equal(acceptedDlpMonths("61"), null);
  assert.equal(acceptedDlpMonths(61), null);
  assert.equal(acceptedDlpMonths("3.5"), null);
  assert.equal(acceptedDlpMonths(12.2), null);
  assert.match(DLP_MONTHS_RANGE_MESSAGE, /3 to 60/);
});
