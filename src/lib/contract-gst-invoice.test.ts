import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  addInvoice,
  getData,
  resetWorkspaceClientForTests,
  updateContract,
} from "@/lib/store";
import type { InvoiceLine } from "@/lib/types";

function line(): InvoiceLine {
  return {
    boqItemId: "boq-gst",
    itemName: "Panel",
    termKey: "supply",
    billedQty: 1,
    rate: 1000,
    termPercent: 100,
    lineNet: 1000,
  };
}

function makeContract(gstApplicable: boolean) {
  return addContract({
    projectName: "GST percent",
    projectNo: `C-GST-${gstApplicable ? "ON" : "OFF"}-${crypto.randomUUID()}`,
    orderNos: "WO-GST",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 10_000,
    gstApplicable,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 0,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [
      {
        id: "boq-gst",
        catalogKey: "panel-gst",
        name: "Panel",
        unit: "Nos",
        rate: 1000,
        quantity: 5,
      },
    ],
  }).contract;
}

test("no tax invoice lets Master save a percent, and the next invoice uses it", () => {
  resetWorkspaceClientForTests();
  const contract = makeContract(true);
  const updated = updateContract(contract.id, {
    gstApplicable: true,
    gstPercent: 12,
  });
  assert.equal(updated?.gstPercent, 12);
  const invoice = addInvoice({
    type: "TI",
    number: "TI-12",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [line()],
  });
  assert.ok(invoice);
  assert.equal(invoice?.netAmount, 1000);
  assert.equal(invoice?.gstAmount, 120);
  assert.equal(invoice?.finalAmount, 1120);
});

test("a tax invoice blocks the GST change and keeps the invoice GST", () => {
  resetWorkspaceClientForTests();
  const contract = makeContract(true);
  const raised = addInvoice({
    type: "TI",
    number: "TI-18",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [line()],
  });
  assert.equal(raised?.gstAmount, 180);
  const blocked = updateContract(contract.id, {
    city: "Pune",
    gstApplicable: true,
    gstPercent: 5,
  });
  assert.equal(blocked?.city, "Pune");
  assert.equal(blocked?.gstApplicable, true);
  assert.equal(blocked?.gstPercent, undefined);
  const stored = getData().invoices.find((invoice) => invoice.id === raised?.id);
  assert.equal(stored?.gstAmount, 180);
  assert.equal(stored?.finalAmount, 1180);
});

test("a proforma does not block the change and is not rewritten", () => {
  resetWorkspaceClientForTests();
  const contract = makeContract(true);
  const proforma = addInvoice({
    type: "PI",
    number: "PI-18",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [line()],
  });
  assert.equal(proforma?.type, "PI");
  assert.equal(proforma?.gstAmount, 180);
  const updated = updateContract(contract.id, {
    gstApplicable: true,
    gstPercent: 5,
  });
  assert.equal(updated?.gstPercent, 5);
  const storedPi = getData().invoices.find((invoice) => invoice.id === proforma?.id);
  assert.equal(storedPi?.gstAmount, 180);
  const taxInvoice = addInvoice({
    type: "TI",
    number: "TI-5",
    date: "2026-10-03",
    contractId: contract.id,
    lines: [line()],
  });
  assert.equal(taxInvoice?.gstAmount, 50);
  assert.equal(
    getData().invoices.find((invoice) => invoice.id === proforma?.id)?.gstAmount,
    180
  );
});

test("saving 0 is stored when no invoice exists, and not applicable stays not applicable", () => {
  resetWorkspaceClientForTests();
  const applicable = makeContract(true);
  const zero = updateContract(applicable.id, {
    gstApplicable: false,
    gstPercent: 0,
  });
  assert.equal(zero?.gstPercent, 0);
  assert.equal(zero?.gstApplicable, false);
  const invoice = addInvoice({
    type: "TI",
    number: "TI-0",
    date: "2026-10-02",
    contractId: applicable.id,
    lines: [line()],
  });
  assert.equal(invoice?.gstAmount, 0);
  assert.equal(invoice?.finalAmount, 1000);

  const plain = makeContract(false);
  const untouched = updateContract(plain.id, { city: "Jaipur" });
  assert.equal(untouched?.gstApplicable, false);
  assert.equal(untouched?.gstPercent, undefined);
  assert.equal(untouched?.city, "Jaipur");
});
