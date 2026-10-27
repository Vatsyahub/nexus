import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvoiceOutstandingRows,
  buildReconciliationDetail,
} from "@/lib/reports";
import {
  invoiceListedPayments,
  invoiceOutstanding,
  invoicePaidAmount,
} from "@/lib/store";
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
      pay({
        id: "pool",
        link: "recoverable",
        invoiceId: null,
        netAmount: 20_000,
      }),
    ])
  )[0];
  assert.deepEqual(row?.paidPaymentIds, ["on-ti"]);
});

test("a zero accounted payment stays off the paid click list", () => {
  const row = buildInvoiceOutstandingRows(
    file([pay({ id: "zero", netAmount: 0 })])
  )[0];
  assert.equal(row?.paid, 0);
  assert.deepEqual(row?.paidPaymentIds, []);
});

test("Chalet unlinked receipts stay in the paid figure and open from it", () => {
  const data = chaletFile();
  const invoice = data.invoices[0];
  const row = buildInvoiceOutstandingRows(data)[0];
  assert.equal(invoicePaidAmount(invoice, data), 1_915_002);
  assert.equal(invoiceOutstanding(invoice, data), 386_116);
  assert.equal(row?.paid, 1_915_002);
  assert.equal(row?.outstanding, 386_116);
  assert.deepEqual(row?.paidPaymentIds, ["sep", "mar", "oct"]);
  assert.deepEqual(
    invoiceListedPayments(invoice, data).map((p) => p.id),
    ["sep", "mar", "oct"]
  );
  const detail = buildReconciliationDetail("c4940", data);
  assert.equal(detail?.totals.paid, 1_915_002);
  assert.equal(detail?.totals.outstanding, 386_116);
  assert.equal(detail?.tis[0]?.netPaid, 500_000);
  assert.equal(detail?.tis[0]?.outstanding, 386_116);
  assert.deepEqual(
    detail?.payments.map((p) => [p.paymentId, p.againstLabel, p.net]),
    [
      ["sep", "Unlinked", 688_000],
      ["mar", "Unlinked", 688_000],
      ["oct", "C4940-036-26-27", 500_000],
    ]
  );
});

test("one unlinked receipt filling two invoices is named on both", () => {
  const second = ti("b");
  second.date = "2026-02-01";
  second.createdAt = "2026-02-01T00:00:00.000Z";
  const data = file(
    [
      pay({
        id: "u",
        link: "unlinked",
        invoiceId: null,
        netAmount: 150_000,
        date: "2026-01-01",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ],
    [ti("a"), second]
  );
  const rows = buildInvoiceOutstandingRows(data);
  const a = rows.find((r) => r.invoiceId === "a");
  const b = rows.find((r) => r.invoiceId === "b");
  assert.equal(a?.paid, 100_000);
  assert.equal(b?.paid, 50_000);
  assert.equal(a?.outstanding, 0);
  assert.equal(b?.outstanding, 50_000);
  assert.deepEqual(a?.paidPaymentIds, ["u"]);
  assert.deepEqual(b?.paidPaymentIds, ["u"]);
});

test("an unlinked receipt that is not counted stays off the invoice", () => {
  const row = buildInvoiceOutstandingRows(
    file([
      pay({ id: "full", netAmount: 100_000 }),
      pay({
        id: "left",
        link: "unlinked",
        invoiceId: null,
        netAmount: 40_000,
        date: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
    ])
  )[0];
  assert.equal(row?.paid, 100_000);
  assert.equal(row?.outstanding, 0);
  assert.deepEqual(row?.paidPaymentIds, ["full"]);
  assert.deepEqual(
    invoiceListedPayments(ti(), file([
      pay({ id: "full", netAmount: 100_000 }),
      pay({
        id: "left",
        link: "unlinked",
        invoiceId: null,
        netAmount: 40_000,
        date: "2026-03-01",
        createdAt: "2026-03-01T00:00:00.000Z",
      }),
    ])).map((p) => p.id),
    ["full"]
  );
});

function chaletFile(): FlowhubData {
  const invoice: Invoice = {
    id: "ti",
    type: "TI",
    number: "C4940-036-26-27",
    date: "2026-09-01",
    contractId: "c4940",
    lines: [],
    netAmount: 1_950_100,
    gstAmount: 351_018,
    extraCharges: [],
    finalAmount: 2_301_118,
    convertedFromPiId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
  return {
    contracts: [
      {
        id: "c4940",
        projectNo: "C4940",
        projectName: "Chalet Hotel",
        city: "Mumbai",
        retentionPercent: 0,
        tdsPercent: 2,
        paymentDueDays: 30,
      } as Contract,
    ],
    invoices: [invoice],
    payments: [
      pay({
        id: "sep",
        contractId: "c4940",
        invoiceId: null,
        link: "unlinked",
        date: "2025-09-27",
        netAmount: 688_000,
        createdAt: "2025-09-27T00:00:00.000Z",
      }),
      pay({
        id: "mar",
        contractId: "c4940",
        invoiceId: null,
        link: "unlinked",
        date: "2026-03-17",
        netAmount: 688_000,
        createdAt: "2026-03-17T00:00:00.000Z",
      }),
      pay({
        id: "oct",
        contractId: "c4940",
        invoiceId: "ti",
        link: "TI",
        date: "2026-10-02",
        netAmount: 500_000,
        tdsAmount: 39_002,
        createdAt: "2026-10-02T00:00:00.000Z",
      }),
    ],
  } as FlowhubData;
}
