import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";
import {
  buildSalesContractRows,
  invoiceNetOutstanding,
} from "@/lib/reports";

function contract(
  partial: Pick<Contract, "id" | "retentionPercent" | "tdsPercent"> &
    Partial<Contract>
): Contract {
  return {
    projectNo: "C-003",
    projectName: "Contract 3",
    city: "Bengaluru",
    orderValue: 10_000_000,
    ...partial,
  } as Contract;
}

function ti(
  partial: Pick<Invoice, "id" | "contractId" | "netAmount"> & Partial<Invoice>
): Invoice {
  const net = partial.netAmount;
  const gst = partial.gstAmount ?? 0;
  return {
    type: "TI",
    number: partial.id,
    date: "2026-01-01",
    lines: [],
    gstAmount: gst,
    extraCharges: [],
    finalAmount: partial.finalAmount ?? net + gst,
    convertedFromPiId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function pay(partial: Partial<Payment> & Pick<Payment, "id" | "contractId">): Payment {
  return {
    invoiceId: null,
    link: "unlinked",
    date: "2026-02-01",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function workspace(
  contracts: Contract[],
  invoices: Invoice[],
  payments: Payment[] = []
): FlowhubData {
  return { contracts, invoices, payments } as FlowhubData;
}

test("TI-C-003 net outstanding is net minus TDS, and total outstanding stays expected cash", () => {
  const c = contract({
    id: "c3",
    projectNo: "C-003",
    retentionPercent: 0,
    tdsPercent: 2,
    orderValue: 20_000_000,
  });
  const invoice = ti({
    id: "ti-c-003",
    number: "TI-C-003",
    contractId: c.id,
    netAmount: 7_840_000,
    gstAmount: 1_411_200,
    finalAmount: 9_251_200,
  });
  const data = workspace([c], [invoice]);
  const row = buildSalesContractRows(data).find((r) => r.projectNo === "C-003");
  assert.ok(row);
  assert.equal(invoiceNetOutstanding(invoice, data), 7_683_200);
  assert.equal(row.totalOutstandingNet, 7_683_200);
  assert.equal(row.totalOutstanding, 9_094_400);
  assert.notEqual(row.totalOutstandingNet, row.totalOutstanding);
  assert.notEqual(row.totalOutstandingNet, row.totalInvoiceNet);
});

test("unlinked FIFO allocates netAmount only, not GST or other deductions", () => {
  const c = contract({ id: "c", retentionPercent: 0, tdsPercent: 0 });
  const first = ti({
    id: "ti-1",
    contractId: c.id,
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    netAmount: 1_000,
  });
  const second = ti({
    id: "ti-2",
    contractId: c.id,
    date: "2026-02-01",
    createdAt: "2026-02-01T00:00:00.000Z",
    netAmount: 800,
  });
  const data = workspace(
    [c],
    [first, second],
    [
      pay({
        id: "p-unlinked",
        contractId: c.id,
        link: "unlinked",
        netAmount: 400,
        gstAmount: 500,
        otherDeductions: 300,
        retentionAmount: 50,
        tdsAmount: 50,
      }),
    ]
  );
  assert.equal(invoiceNetOutstanding(first, data), 600);
  assert.equal(invoiceNetOutstanding(second, data), 800);
  const row = buildSalesContractRows(data)[0];
  assert.equal(row.totalOutstandingNet, 1_400);
});

test("linked net received ignores GST, other, retention, and TDS on the payment", () => {
  const c = contract({ id: "c", retentionPercent: 5, tdsPercent: 2 });
  const invoice = ti({
    id: "ti",
    contractId: c.id,
    netAmount: 10_000,
    gstAmount: 1_800,
    finalAmount: 11_800,
  });
  const data = workspace(
    [c],
    [invoice],
    [
      pay({
        id: "p-linked",
        contractId: c.id,
        invoiceId: invoice.id,
        link: "TI",
        netAmount: 1_000,
        gstAmount: 180,
        otherDeductions: 40,
        retentionAmount: 999,
        tdsAmount: 999,
      }),
    ]
  );
  // 10000 − 500 ret − 200 TDS − 1000 linked net
  assert.equal(invoiceNetOutstanding(invoice, data), 8_300);
});

test("linked net above the net outstanding is an overpayment", () => {
  const c = contract({ id: "c", retentionPercent: 0, tdsPercent: 0 });
  const invoice = ti({
    id: "ti",
    contractId: c.id,
    netAmount: 1_000,
  });
  const data = workspace(
    [c],
    [invoice],
    [
      pay({
        id: "p",
        contractId: c.id,
        invoiceId: invoice.id,
        link: "TI",
        netAmount: 1_500,
        gstAmount: 100,
      }),
    ]
  );
  assert.equal(invoiceNetOutstanding(invoice, data), -500);
});

test("earlier tax invoices take unlinked net first", () => {
  const c = contract({ id: "c", retentionPercent: 0, tdsPercent: 0 });
  const later = ti({
    id: "later",
    contractId: c.id,
    date: "2026-03-01",
    createdAt: "2026-03-01T00:00:00.000Z",
    netAmount: 100,
  });
  const earlier = ti({
    id: "earlier",
    contractId: c.id,
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    netAmount: 100,
  });
  const data = workspace(
    [c],
    [later, earlier],
    [pay({ id: "p", contractId: c.id, netAmount: 150 })]
  );
  assert.equal(invoiceNetOutstanding(earlier, data), 0);
  assert.equal(invoiceNetOutstanding(later, data), 50);
});
