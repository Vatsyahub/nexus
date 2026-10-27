import assert from "node:assert/strict";
import test from "node:test";
import { buildInvoiceOutstandingRows } from "@/lib/reports";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";

function contract(): Contract {
  return {
    id: "c",
    projectNo: "C-100",
    projectName: "Paid link",
    city: "Pune",
    retentionPercent: 0,
    tdsPercent: 0,
    paymentDueDays: 0,
  } as Contract;
}

function ti(id = "ti"): Invoice {
  return {
    id,
    type: "TI",
    number: id,
    date: "2026-01-15",
    contractId: "c",
    lines: [],
    netAmount: 100_000,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 100_000,
    convertedFromPiId: null,
    createdAt: "2026-01-15T00:00:00.000Z",
  };
}

function pay(partial: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    contractId: "c",
    invoiceId: "ti",
    link: "TI",
    date: "2026-02-01",
    netAmount: 40_000,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function file(payments: Payment[], invoices: Invoice[] = [ti()]): FlowhubData {
  return { contracts: [contract()], invoices, payments } as FlowhubData;
}

test("one linked payment is the paid amount's payment page", () => {
  const row = buildInvoiceOutstandingRows(file([pay({ id: "pay-1" })]))[0];
  assert.equal(row?.paid, 40_000);
  assert.deepEqual(row?.paidPaymentIds, ["pay-1"]);
});

test("no payment leaves the paid amount with nothing to open", () => {
  const row = buildInvoiceOutstandingRows(file([]))[0];
  assert.equal(row?.paid, 0);
  assert.deepEqual(row?.paidPaymentIds, []);
});

test("several payments on one invoice stay in date order", () => {
  const row = buildInvoiceOutstandingRows(
    file([
      pay({
        id: "later",
        date: "2026-03-01",
        netAmount: 10_000,
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
      pay({
        id: "earlier",
        date: "2026-02-01",
        netAmount: 25_000,
        createdAt: "2026-02-01T00:00:00.000Z",
      }),
    ])
  )[0];
  assert.deepEqual(row?.paidPaymentIds, ["earlier", "later"]);
});

test("a proforma payment and another invoice's payment are not this paid amount", () => {
  const row = buildInvoiceOutstandingRows(
    file([
      pay({ id: "on-ti", netAmount: 15_000 }),
      pay({ id: "on-pi", link: "PI", invoiceId: "pi", netAmount: 9_000 }),
      pay({ id: "other-ti", invoiceId: "ti-2", netAmount: 8_000 }),
    ])
  )[0];
  assert.deepEqual(row?.paidPaymentIds, ["on-ti"]);
});
