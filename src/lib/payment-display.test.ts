import assert from "node:assert/strict";
import test from "node:test";
import { formatOtherDeductions } from "@/lib/payment-display";

test("formatOtherDeductions shows amount and reason together", () => {
  const out = formatOtherDeductions(500, "Freight");
  assert.match(out, /500/);
  assert.match(out, /Freight/);
});

test("formatOtherDeductions treats missing reason as amount only", () => {
  assert.equal(formatOtherDeductions(100, undefined), formatOtherDeductions(100, ""));
});
