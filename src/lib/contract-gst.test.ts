import assert from "node:assert/strict";
import test from "node:test";
import {
  GST_INVOICE_LOCK_MESSAGE,
  contractGstRate,
  contractGstSummary,
  gstFieldsForSave,
  gstSaveRefusal,
  acceptedGstPercent,
} from "@/lib/contract-gst";
import { GST_RATE } from "@/lib/types";

const money = (amount: number) => `₹${amount}`;

test("an applicable contract stays 18 and a not-applicable one stays not applicable", () => {
  const applicable = { gstApplicable: true, orderValue: 1000 };
  assert.equal(contractGstRate(applicable), GST_RATE);
  assert.equal(
    contractGstSummary(applicable, money),
    `18% · w/ GST ₹${1000 * (1 + GST_RATE)}`
  );
  const plain = { gstApplicable: false, orderValue: 1000 };
  assert.equal(contractGstRate(plain), 0);
  assert.equal(contractGstSummary(plain, money), "Not applicable");
  assert.equal(gstFieldsForSave(applicable, 18), null);
  assert.equal(gstFieldsForSave(plain, 0), null);
});

test("Master can save 18, 12, 5, or 0 when no tax invoice exists", () => {
  const applicable = { gstApplicable: true };
  for (const percent of [18, 12, 5, 0]) {
    assert.equal(acceptedGstPercent(String(percent)), percent);
    assert.equal(
      gstSaveRefusal(applicable, [], "c1", percent),
      null
    );
  }
  assert.deepEqual(gstFieldsForSave(applicable, 12), {
    gstApplicable: true,
    gstPercent: 12,
  });
  assert.deepEqual(gstFieldsForSave(applicable, 5), {
    gstApplicable: true,
    gstPercent: 5,
  });
  assert.deepEqual(gstFieldsForSave(applicable, 0), {
    gstApplicable: false,
    gstPercent: 0,
  });
  assert.equal(
    contractGstSummary(
      { gstApplicable: true, gstPercent: 12, orderValue: 1000 },
      money
    ),
    "12% · w/ GST ₹1120"
  );
  assert.equal(
    contractGstSummary(
      { gstApplicable: false, gstPercent: 0, orderValue: 1000 },
      money
    ),
    "0% · w/ GST ₹1000"
  );
});

test("a raised tax invoice refuses a GST change and a proforma does not", () => {
  const applicable = { gstApplicable: true };
  const taxInvoice = [{ type: "TI" as const, contractId: "c1" }];
  const proforma = [{ type: "PI" as const, contractId: "c1" }];
  assert.equal(
    gstSaveRefusal(applicable, taxInvoice, "c1", 12),
    GST_INVOICE_LOCK_MESSAGE
  );
  assert.equal(gstSaveRefusal(applicable, taxInvoice, "c1", 0), GST_INVOICE_LOCK_MESSAGE);
  assert.equal(gstSaveRefusal(applicable, taxInvoice, "c1", 18), null);
  assert.equal(gstSaveRefusal(applicable, proforma, "c1", 12), null);
  assert.equal(
    gstSaveRefusal(applicable, [...proforma, ...taxInvoice], "c1", 5),
    GST_INVOICE_LOCK_MESSAGE
  );
  assert.equal(acceptedGstPercent("-1"), null);
  assert.equal(acceptedGstPercent("nope"), null);
});
