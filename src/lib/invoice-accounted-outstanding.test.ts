import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvoiceOutstandingRows,
  buildReconciliationDetail,
  buildReconciliationSummary,
  buildSalesContractRows,
  collectionCashReceived,
  invoiceNetOutstanding,
} from "@/lib/reports";
import {
  invoiceBalanceLabel,
  invoiceExpectedCash,
  invoiceOutstanding,
  invoicePaidAmount,
  paymentAccounted,
  paymentCash,
  paymentTowardOutstanding,
} from "@/lib/store";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";

const GODREJ_FINAL = 504_450;
const GODREJ_NET = 427_500;
const GODREJ_GST = 76_950;
const GODREJ_RETENTION = 21_375;
const GODREJ_PAYMENT_TDS = 7_328.71;
const GODREJ_RECOVERED = 72_064.29;
const GODREJ_EXPECTED_TDS = 8_550;
const GODREJ_EXPECTED_CASH = 474_525;

function contract(
  partial: Pick<Contract, "id"> & Partial<Contract>
): Contract {
  return {
    projectNo: partial.id,
    projectName: partial.id,
    city: "Mumbai",
    orderValue: 1_000_000,
    retentionPercent: 0,
    tdsPercent: 0,
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
    date: "2026-01-15",
    lines: [],
    gstAmount: gst,
    extraCharges: [],
    finalAmount: partial.finalAmount ?? net + gst,
    convertedFromPiId: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    ...partial,
  };
}

function pay(
  partial: Partial<Payment> & Pick<Payment, "id" | "contractId">
): Payment {
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
    recovered: 0,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function workspace(
  contracts: Contract[],
  invoices: Invoice[],
  payments: Payment[]
): FlowhubData {
  return { contracts, invoices, payments } as FlowhubData;
}

function godrejInvoice(): Invoice {
  return ti({
    id: "ti-godrej",
    number: "TI-GODREJ",
    contractId: "godrej",
    netAmount: GODREJ_NET,
    gstAmount: GODREJ_GST,
    finalAmount: GODREJ_FINAL,
  });
}

function godrejContract(): Contract {
  return contract({
    id: "godrej",
    projectNo: "GODREJ",
    projectName: "Godrej",
    retentionPercent: 5,
    tdsPercent: 2,
  });
}

function godrejPayment(partial: Partial<Payment> = {}): Payment {
  return pay({
    id: "pay-godrej",
    contractId: "godrej",
    invoiceId: "ti-godrej",
    link: "TI",
    netAmount: 326_732,
    gstAmount: GODREJ_GST,
    retentionAmount: GODREJ_RETENTION,
    tdsAmount: GODREJ_PAYMENT_TDS,
    otherDeductions: 0,
    recovered: GODREJ_RECOVERED,
    ...partial,
  });
}

test("Godrej payment TDS below contract TDS does not leave Extra when the sum matches the invoice", () => {
  const invoice = godrejInvoice();
  const payment = godrejPayment();
  const data = workspace([godrejContract()], [invoice], [payment]);
  const accounted =
    326_732 +
    GODREJ_GST +
    GODREJ_RETENTION +
    GODREJ_PAYMENT_TDS +
    GODREJ_RECOVERED;

  assert.equal(accounted, GODREJ_FINAL);
  assert.equal(paymentAccounted(payment), GODREJ_FINAL);
  assert.equal(paymentCash(payment), 403_682);
  assert.equal(collectionCashReceived(payment), 403_682);
  assert.notEqual(paymentCash(payment), paymentAccounted(payment));

  const tdsGap = GODREJ_EXPECTED_TDS - GODREJ_PAYMENT_TDS;
  assert.ok(Math.abs(tdsGap - 1_221.29) < 0.001);
  const oldOutstanding =
    invoiceExpectedCash(invoice, data) - paymentTowardOutstanding(payment);
  assert.ok(Math.abs(oldOutstanding - -tdsGap) < 0.001);

  assert.equal(invoiceOutstanding(invoice, data), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(invoice, data)), "Paid");
  assert.equal(invoiceNetOutstanding(invoice, data), 0);

  const detail = buildReconciliationDetail("godrej", data);
  assert.equal(detail?.tis[0]?.outstanding, 0);
  assert.equal(detail?.totals.outstanding, 0);
  const sales = buildSalesContractRows(data)[0];
  assert.equal(sales?.totalOutstanding, 0);
  assert.equal(sales?.totalOutstandingNet, 0);
});

test("Godrej Yerwada C4953P/014/26-27 Paid amount is the accounted total", () => {
  const invoice = {
    ...godrejInvoice(),
    number: "C4953P/014/26-27",
  };
  const contract = {
    ...godrejContract(),
    projectName: "Godrej Yerwada",
  };
  const payment = godrejPayment();
  const data = workspace([contract], [invoice], [payment]);
  const paid =
    326_732 +
    GODREJ_GST +
    GODREJ_RETENTION +
    GODREJ_PAYMENT_TDS +
    GODREJ_RECOVERED;

  assert.equal(paid, 504_450);
  assert.equal(paymentAccounted(payment), 504_450);
  assert.equal(
    paymentTowardOutstanding(payment),
    326_732 + GODREJ_GST + GODREJ_RECOVERED
  );
  assert.notEqual(paymentTowardOutstanding(payment), paid);
  assert.equal(invoicePaidAmount(invoice, data), 504_450);
  assert.equal(invoiceOutstanding(invoice, data), 0);
  assert.equal(invoiceExpectedCash(invoice, data), GODREJ_EXPECTED_CASH);

  const detail = buildReconciliationDetail("godrej", data);
  assert.equal(detail?.totals.paid, 504_450);
  assert.equal(detail?.totals.outstanding, 0);
  assert.equal(detail?.tis[0]?.netPaid, 326_732);
  assert.equal(detail?.tis[0]?.gstPaid, GODREJ_GST);
  assert.equal(detail?.tis[0]?.otherPaid, 0);
  assert.equal(detail?.payments[0]?.paidTotal, 504_450);
  assert.equal(buildReconciliationSummary(data)[0]?.paid, 504_450);
  assert.equal(buildSalesContractRows(data)[0]?.totalPaid, 504_450);
  assert.equal(buildSalesContractRows(data)[0]?.totalOutstanding, 0);

  const row = buildInvoiceOutstandingRows(data)[0];
  assert.equal(row?.number, "C4953P/014/26-27");
  assert.equal(row?.paid, 504_450);
  assert.equal(row?.outstanding, 0);
});

test("true over-accounting stores only the amount above the invoice final", () => {
  const invoice = godrejInvoice();
  const payment = godrejPayment({ recovered: GODREJ_RECOVERED + 100 });
  const data = workspace([godrejContract()], [invoice], [payment]);
  const outstanding = invoiceOutstanding(invoice, data);

  assert.equal(paymentAccounted(payment), GODREJ_FINAL + 100);
  assert.equal(outstanding, -100);
  assert.equal(invoiceBalanceLabel(outstanding), "Paid");
  assert.equal(paymentCash(payment), 403_682);
  const detail = buildReconciliationDetail("godrej", data);
  assert.equal(detail?.tis[0]?.outstanding, -100);
  assert.equal(buildSalesContractRows(data)[0]?.totalOutstanding, -100);
});

test("an invoice with no payment keeps expected-cash outstanding", () => {
  const invoice = godrejInvoice();
  const data = workspace([godrejContract()], [invoice], []);

  assert.equal(invoiceExpectedCash(invoice, data), GODREJ_EXPECTED_CASH);
  assert.equal(invoiceOutstanding(invoice, data), GODREJ_EXPECTED_CASH);
  assert.notEqual(invoiceOutstanding(invoice, data), GODREJ_FINAL);
  assert.equal(invoicePaidAmount(invoice, data), 0);
  assert.equal(buildReconciliationDetail("godrej", data)?.totals.paid, 0);
  assert.equal(buildReconciliationSummary(data)[0]?.paid, 0);
  assert.equal(buildSalesContractRows(data)[0]?.totalPaid, 0);
  assert.equal(buildInvoiceOutstandingRows(data)[0]?.paid, 0);
  assert.match(invoiceBalanceLabel(invoiceOutstanding(invoice, data)), /^Due /);

  const unlinked = pay({
    id: "unlinked-cash",
    contractId: "godrej",
    link: "unlinked",
    netAmount: 1_000,
    retentionAmount: 400,
    tdsAmount: 80,
  });
  const withCash = workspace([godrejContract()], [invoice], [unlinked]);
  assert.equal(
    invoiceOutstanding(invoice, withCash),
    GODREJ_EXPECTED_CASH - 1_000
  );
  assert.equal(invoicePaidAmount(invoice, withCash), 1_000);
  assert.equal(buildReconciliationDetail("godrej", withCash)?.totals.paid, 1_000);
  assert.equal(buildSalesContractRows(withCash)[0]?.totalPaid, 1_000);
  assert.equal(buildInvoiceOutstandingRows(withCash)[0]?.paid, 1_000);
  assert.equal(
    buildInvoiceOutstandingRows(withCash)[0]?.outstanding,
    GODREJ_EXPECTED_CASH - 1_000
  );
});

test("Paid keeps the FIFO slice outstanding already counts, including linked retention and TDS", () => {
  const c = contract({
    id: "c",
    retentionPercent: 5,
    tdsPercent: 2,
  });
  const invoice = ti({
    id: "ti",
    contractId: c.id,
    netAmount: 10_000,
    gstAmount: 1_800,
    finalAmount: 11_800,
  });
  const linked = pay({
    id: "linked",
    contractId: c.id,
    invoiceId: invoice.id,
    link: "TI",
    netAmount: 4_000,
    gstAmount: 720,
    retentionAmount: 500,
    tdsAmount: 200,
    otherDeductions: 30,
    recovered: 50,
  });
  const unlinked = pay({
    id: "unlinked",
    contractId: c.id,
    link: "unlinked",
    date: "2026-03-01",
    netAmount: 7_000,
    retentionAmount: 999,
    tdsAmount: 999,
  });
  const recoverable = pay({
    id: "recoverable",
    contractId: c.id,
    link: "recoverable",
    netAmount: 10_000,
    gstAmount: 1_800,
    retentionAmount: 10_000,
  });
  const data = workspace([c], [invoice], [linked, unlinked, recoverable]);
  const linkedAccounted = 4_000 + 720 + 500 + 200 + 30 + 50;
  const gap = 11_800 - linkedAccounted;

  assert.equal(paymentAccounted(linked), linkedAccounted);
  assert.equal(paymentTowardOutstanding(linked), 4_000 + 720 + 30 + 50);
  assert.equal(paymentTowardOutstanding(unlinked), 7_000);
  assert.equal(invoiceExpectedCash(invoice, data), 11_100);
  assert.equal(invoicePaidAmount(invoice, data), linkedAccounted + gap);
  assert.equal(invoicePaidAmount(invoice, data), 11_800);
  assert.equal(invoiceOutstanding(invoice, data), 0);
  assert.equal(buildReconciliationDetail("c", data)?.totals.paid, 11_800);
  assert.equal(buildReconciliationDetail("c", data)?.totals.outstanding, 0);
  assert.equal(buildReconciliationSummary(data)[0]?.paid, 11_800);
  assert.equal(buildSalesContractRows(data)[0]?.totalPaid, 11_800);
  assert.equal(buildSalesContractRows(data)[0]?.totalOutstanding, 0);
  assert.equal(buildInvoiceOutstandingRows(data)[0]?.paid, 11_800);
  assert.equal(buildInvoiceOutstandingRows(data)[0]?.outstanding, 0);
});

test("a deduction is included in the accounted sum", () => {
  const c = contract({
    id: "ded",
    retentionPercent: 5,
    tdsPercent: 2,
  });
  const invoice = ti({
    id: "ti-ded",
    contractId: c.id,
    netAmount: 10_000,
    gstAmount: 1_800,
    finalAmount: 11_800,
  });
  const payment = pay({
    id: "p-ded",
    contractId: c.id,
    invoiceId: invoice.id,
    link: "TI",
    netAmount: 7_000,
    gstAmount: 1_800,
    otherDeductions: 250,
    retentionAmount: 400,
    tdsAmount: 100,
    recovered: 150,
  });
  const data = workspace([c], [invoice], [payment]);
  const accounted = 7_000 + 1_800 + 250 + 400 + 100 + 150;

  assert.equal(paymentAccounted(payment), accounted);
  assert.equal(paymentCash(payment), 8_800);
  assert.equal(invoiceOutstanding(invoice, data), 11_800 - accounted);
  assert.equal(invoiceOutstanding(invoice, data), 2_100);

  const closes = ti({
    id: "ti-close",
    contractId: c.id,
    netAmount: 1_000,
    gstAmount: 0,
    finalAmount: 1_000,
  });
  const closingPayment = pay({
    id: "p-close",
    contractId: c.id,
    invoiceId: closes.id,
    link: "TI",
    netAmount: 800,
    otherDeductions: 80,
    retentionAmount: 50,
    tdsAmount: 10,
    recovered: 60,
  });
  const closed = workspace([c], [closes], [closingPayment]);
  assert.equal(paymentAccounted(closingPayment), 1_000);
  assert.equal(invoiceOutstanding(closes, closed), 0);
  assert.equal(invoiceBalanceLabel(0), "Paid");
});
