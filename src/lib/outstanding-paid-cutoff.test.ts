import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvoiceOutstandingRows,
  buildReconciliationDetail,
  invoiceOutstandingStatus,
  sumOpenOutstanding,
  type InvoiceOutstandingRow,
} from "@/lib/reports";
import {
  invoiceBalanceLabel,
  invoiceIsPaid,
  invoiceOutstanding,
  OUTSTANDING_PAID_BELOW_RUPEES,
  outstandingIsStillDue,
} from "@/lib/store";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";

const TODAY = "2026-10-16";
const PAST = "2026-10-01";
const FUTURE = "2026-10-20";

function contract(): Contract {
  return {
    id: "c",
    projectNo: "C-100",
    projectName: "Cutoff",
    city: "Pune",
    retentionPercent: 0,
    tdsPercent: 0,
    paymentDueDays: 0,
  } as Contract;
}

function ti(
  finalAmount: number,
  id = "ti",
  createdAt = "2026-10-01T00:00:00.000Z"
): Invoice {
  return {
    id,
    type: "TI",
    number: id,
    date: PAST,
    contractId: "c",
    lines: [],
    netAmount: finalAmount,
    gstAmount: 0,
    extraCharges: [],
    finalAmount,
    convertedFromPiId: null,
    createdAt,
  };
}

function pay(netAmount: number): Payment {
  return {
    id: "p",
    contractId: "c",
    invoiceId: "ti",
    link: "TI",
    date: "2026-10-02",
    netAmount,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-10-02T00:00:00.000Z",
  };
}

function workspace(invoices: Invoice[], payments: Payment[] = []): FlowhubData {
  return { contracts: [contract()], invoices, payments } as FlowhubData;
}

function row(outstanding: number): InvoiceOutstandingRow {
  return {
    invoiceId: `ti-${outstanding}`,
    contractId: "c",
    projectNo: "C-100",
    projectName: "Cutoff",
    city: "Pune",
    number: String(outstanding),
    date: PAST,
    dueDate: PAST,
    finalAmount: Math.abs(outstanding),
    expected: Math.abs(outstanding),
    paid: 0,
    outstanding,
    daysUntilDue: -15,
    status: "due",
  };
}

test("Rs 1 and Rs 99.99 count as paid; Rs 100 stays due", () => {
  assert.equal(OUTSTANDING_PAID_BELOW_RUPEES, 100);
  for (const amount of [0, 1, 99.99]) {
    assert.equal(outstandingIsStillDue(amount), false, String(amount));
    assert.equal(invoiceBalanceLabel(amount), "Paid", String(amount));
    assert.equal(
      invoiceOutstandingStatus(amount, 0, PAST, TODAY),
      "paid",
      String(amount)
    );
  }
  assert.equal(outstandingIsStillDue(100), true);
  assert.match(invoiceBalanceLabel(100), /^Due /);
  assert.doesNotMatch(invoiceBalanceLabel(1), /Due/);
  assert.doesNotMatch(invoiceBalanceLabel(99.99), /Due/);
});

test("Rs 100 and above keeps overdue, partially paid, and due", () => {
  assert.equal(invoiceOutstandingStatus(100, 0, PAST, TODAY), "overdue");
  assert.equal(invoiceOutstandingStatus(100, 0, TODAY, TODAY), "due");
  assert.equal(invoiceOutstandingStatus(100, 0, FUTURE, TODAY), "due");
  assert.equal(invoiceOutstandingStatus(100, 40, FUTURE, TODAY), "partially paid");
  assert.equal(invoiceOutstandingStatus(250, 0.006, FUTURE, TODAY), "partially paid");
  assert.equal(invoiceOutstandingStatus(250, 0.005, FUTURE, TODAY), "due");
  assert.equal(invoiceOutstandingStatus(1, 0, PAST, TODAY), "paid");
  assert.equal(invoiceOutstandingStatus(99.99, 50, PAST, TODAY), "paid");
});

test("a negative outstanding is Extra, not a Due label, and stored math stays exact", () => {
  const data = workspace([ti(100)], [pay(140)]);
  const invoice = data.invoices[0];
  assert.equal(invoiceOutstanding(invoice, data), -40);
  assert.equal(invoiceIsPaid(invoice, data), true);
  const label = invoiceBalanceLabel(-40);
  assert.match(label, /^Extra /);
  assert.doesNotMatch(label, /Due/);
  assert.equal(invoiceOutstandingStatus(-40, 140, PAST, TODAY), "paid");

  const rupee = workspace([ti(1)]);
  assert.equal(invoiceOutstanding(rupee.invoices[0], rupee), 1);
  assert.equal(invoiceIsPaid(rupee.invoices[0], rupee), true);

  const dust = workspace([ti(99.99, "ti-99")]);
  assert.equal(invoiceOutstanding(dust.invoices[0], dust), 99.99);
  assert.equal(invoiceIsPaid(dust.invoices[0], dust), true);

  const full = workspace([ti(100, "ti-100")]);
  assert.equal(invoiceOutstanding(full.invoices[0], full), 100);
  assert.equal(invoiceIsPaid(full.invoices[0], full), false);
});

test("outstanding totals skip under Rs 100 and reconciliation keeps the exact balance", () => {
  assert.equal(
    sumOpenOutstanding([row(1), row(99.99), row(100), row(-40), row(250.5)]),
    350.5
  );

  const small = workspace([
    ti(1, "ti", "2026-10-01T00:00:01.000Z"),
    ti(99.99, "ti-b", "2026-10-01T00:00:02.000Z"),
    ti(100, "ti-c", "2026-10-01T00:00:03.000Z"),
  ]);
  const rows = buildInvoiceOutstandingRows(small);
  assert.deepEqual(
    rows.map((r) => [r.number, r.outstanding, r.status]),
    [
      ["ti", 1, "paid"],
      ["ti-b", 99.99, "paid"],
      ["ti-c", 100, "overdue"],
    ]
  );
  assert.equal(sumOpenOutstanding(rows), 100);

  const detail = buildReconciliationDetail("c", workspace([ti(1)]));
  assert.ok(detail);
  assert.equal(detail.tis[0].outstanding, 1);
  assert.equal(detail.totals.outstanding, 1);

  const under = buildReconciliationDetail("c", workspace([ti(99.99)]));
  assert.equal(under?.totals.outstanding, 99.99);
});
