import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "@/lib/format-money";
import {
  formatOtherDeductions,
  formatRecoverableRunningLine,
  paymentLinkLabel,
} from "@/lib/payment-display";

test("formatOtherDeductions shows amount and reason together", () => {
  const out = formatOtherDeductions(500, "Freight");
  assert.match(out, /500/);
  assert.match(out, /Freight/);
});

test("formatOtherDeductions treats missing reason as amount only", () => {
  assert.equal(formatOtherDeductions(100, undefined), formatOtherDeductions(100, ""));
});

test("recoverable running line uses Recovered, of, and left", () => {
  assert.equal(
    formatRecoverableRunningLine(50, 100),
    `Recovered ${formatMoney(50)} of ${formatMoney(100)}, ${formatMoney(50)} left`
  );
});

test("payment link label names Recoverable beside the other choices", () => {
  assert.equal(paymentLinkLabel("recoverable"), "Recoverable");
  assert.equal(paymentLinkLabel("TI"), "Tax invoice");
  assert.equal(paymentLinkLabel("PI"), "Proforma");
  assert.equal(paymentLinkLabel("unlinked"), "Unlinked");
});
