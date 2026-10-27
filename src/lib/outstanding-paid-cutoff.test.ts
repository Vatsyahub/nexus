import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvoiceOutstandingRows,
  buildReconciliationDetail,
  invoiceOutstandingStatus,
  sumOpenOutstanding,
  type InvoiceOutstandingRow,
} from "@/lib/reports";
import { formatMoney } from "@/lib/format-money";
import {
  invoiceBalanceLabel,
  invoiceIsPaid,
  invoiceOutstanding,
  OUTSTANDING_PAID_WITHIN_RUPEES,
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
    paidPaymentIds: [],
    outstanding,
    daysUntilDue: -15,
    status: "due",
  };
}

test("Rs 199.99 and Rs 200 count as paid; Rs 200.01 stays due", () => {
  assert.equal(OUTSTANDING_PAID_WITHIN_RUPEES, 200);
  for (const amount of [0, 1, 199.99, 200, -200]) {
    assert.equal(outstandingIsStillDue(amount), false, String(amount));
    assert.equal(invoiceBalanceLabel(amount), "Paid", String(amount));
    assert.equal(
      invoiceOutstandingStatus(amount, 0, PAST, TODAY),
      "paid",
      String(amount)
    );
  }
  assert.equal(outstandingIsStillDue(200.01), true);
  assert.match(invoiceBalanceLabel(200.01), /^Due /);
  assert.doesNotMatch(invoiceBalanceLabel(200.01), /Extra/);
  assert.doesNotMatch(invoiceBalanceLabel(199.99), /Due/);
  assert.doesNotMatch(invoiceBalanceLabel(200), /Due/);
});

test("a shortfall above Rs 200 keeps overdue, partially paid, and due", () => {
  assert.equal(invoiceOutstandingStatus(200.01, 0, PAST, TODAY), "overdue");
  assert.equal(invoiceOutstandingStatus(200.01, 0, TODAY, TODAY), "due");
  assert.equal(invoiceOutstandingStatus(200.01, 0, FUTURE, TODAY), "due");
  assert.equal(
    invoiceOutstandingStatus(200.01, 40, FUTURE, TODAY),
    "partially paid"
  );
  assert.equal(
    invoiceOutstandingStatus(1_000, 0.006, FUTURE, TODAY),
    "partially paid"
  );
  assert.equal(invoiceOutstandingStatus(1_000, 0.005, FUTURE, TODAY), "due");
  assert.equal(invoiceOutstandingStatus(200, 0, PAST, TODAY), "paid");
  assert.equal(invoiceOutstandingStatus(199.99, 50, PAST, TODAY), "paid");
  assert.match(invoiceBalanceLabel(1_000), /^Due /);
  assert.equal(outstandingIsStillDue(1_000), true);
});

test("extra Rs 200 is Paid and extra Rs 200.01 is Extra, not Due", () => {
  assert.equal(invoiceBalanceLabel(-200), "Paid");
  assert.equal(outstandingIsStillDue(-200), false);
  assert.equal(invoiceOutstandingStatus(-200, 1_200, PAST, TODAY), "paid");

  const extraEdge = invoiceBalanceLabel(-200.01);
  assert.equal(extraEdge, `Extra ${formatMoney(200.01)}`);
  assert.doesNotMatch(extraEdge, /Due/);
  assert.equal(outstandingIsStillDue(-200.01), false);
  assert.equal(invoiceOutstandingStatus(-200.01, 1_200.01, PAST, TODAY), "paid");

  const within = workspace([ti(1_000)], [pay(1_200)]);
  assert.equal(invoiceOutstanding(within.invoices[0], within), -200);
  assert.equal(invoiceIsPaid(within.invoices[0], within), true);
  assert.equal(invoiceBalanceLabel(-200), "Paid");

  const over = workspace(
    [ti(1_000, "ti-over")],
    [{ ...pay(1_200.01), invoiceId: "ti-over" }]
  );
  assert.equal(invoiceOutstanding(over.invoices[0], over), -200.01);
  assert.equal(invoiceIsPaid(over.invoices[0], over), false);
  assert.match(invoiceBalanceLabel(-200.01), /^Extra /);

  const short = workspace([ti(200, "ti-200")]);
  assert.equal(invoiceOutstanding(short.invoices[0], short), 200);
  assert.equal(invoiceIsPaid(short.invoices[0], short), true);

  const justDue = workspace([ti(200.01, "ti-due")]);
  assert.equal(invoiceOutstanding(justDue.invoices[0], justDue), 200.01);
  assert.equal(invoiceIsPaid(justDue.invoices[0], justDue), false);

  const large = workspace([ti(1_000, "ti-large")]);
  assert.equal(invoiceOutstanding(large.invoices[0], large), 1_000);
  assert.equal(invoiceIsPaid(large.invoices[0], large), false);
  assert.match(invoiceBalanceLabel(1_000), /^Due /);
});

test("outstanding totals skip the Rs 200 band and reconciliation keeps the exact balance", () => {
  assert.equal(
    sumOpenOutstanding([
      row(199.99),
      row(200),
      row(200.01),
      row(-200),
      row(-200.01),
      row(1_000),
    ]),
    1_200.01
  );

  const band = workspace([
    ti(199.99, "ti", "2026-10-01T00:00:01.000Z"),
    ti(200, "ti-b", "2026-10-01T00:00:02.000Z"),
    ti(200.01, "ti-c", "2026-10-01T00:00:03.000Z"),
    ti(1_000, "ti-d", "2026-10-01T00:00:04.000Z"),
  ]);
  const rows = buildInvoiceOutstandingRows(band);
  assert.deepEqual(
    rows.map((r) => [r.number, r.outstanding, r.status]),
    [
      ["ti", 199.99, "paid"],
      ["ti-b", 200, "paid"],
      ["ti-c", 200.01, "overdue"],
      ["ti-d", 1_000, "overdue"],
    ]
  );
  assert.equal(sumOpenOutstanding(rows), 1_200.01);

  const detail = buildReconciliationDetail("c", workspace([ti(200)]));
  assert.ok(detail);
  assert.equal(detail.tis[0].outstanding, 200);
  assert.equal(detail.totals.outstanding, 200);

  const under = buildReconciliationDetail("c", workspace([ti(199.99)]));
  assert.equal(under?.totals.outstanding, 199.99);

  const extra = buildReconciliationDetail(
    "c",
    workspace([ti(1_000)], [pay(1_200)])
  );
  assert.equal(extra?.tis[0].outstanding, -200);
  assert.equal(extra?.totals.outstanding, -200);

  const extraOver = buildReconciliationDetail(
    "c",
    workspace([ti(1_000)], [pay(1_200.01)])
  );
  assert.equal(extraOver?.tis[0].outstanding, -200.01);
  assert.equal(extraOver?.totals.outstanding, -200.01);
});
