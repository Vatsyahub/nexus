import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "@/lib/format-money";
import {
  buildInvoiceOutstandingRows,
  buildReconciliationDetail,
  invoiceOutstandingStatus,
  sumOpenOutstanding,
} from "@/lib/reports";
import {
  invoiceActualRetentionHold,
  invoiceBalanceLabel,
  invoiceOutstanding,
  invoicePaidAmount,
  outstandingIsStillDue,
  taxInvoiceEntryStatus,
} from "@/lib/store";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";

const LAKH = 100_000;

function contract(id = "c"): Contract {
  return {
    id,
    projectNo: id,
    projectName: id,
    city: "Pune",
    retentionPercent: 0,
    tdsPercent: 0,
    paymentDueDays: 0,
  } as Contract;
}

function ti(partial: Partial<Invoice> & Pick<Invoice, "id" | "finalAmount">): Invoice {
  return {
    type: "TI",
    number: partial.number ?? partial.id,
    date: partial.date ?? "2026-01-01",
    contractId: partial.contractId ?? "c",
    lines: [],
    netAmount: partial.netAmount ?? partial.finalAmount,
    gstAmount: partial.gstAmount ?? 0,
    extraCharges: [],
    convertedFromPiId: null,
    createdAt: partial.createdAt ?? `${partial.date ?? "2026-01-01"}T00:00:00.000Z`,
    ...partial,
  };
}

function pay(partial: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    contractId: "c",
    invoiceId: null,
    link: "unlinked",
    date: "2026-06-01",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...partial,
  };
}

function data(
  invoices: Invoice[],
  payments: Payment[],
  contracts: Contract[] = [contract()]
): FlowhubData {
  return { contracts, invoices, payments } as FlowhubData;
}

function linked(
  id: string,
  invoiceId: string,
  amount: number,
  extra: Partial<Payment> = {}
): Payment {
  return pay({
    id,
    invoiceId,
    link: "TI",
    netAmount: amount,
    ...extra,
  });
}

test("Rahul's linked spare clears the other invoice on the same contract", () => {
  const first = ti({
    id: "ti-1",
    number: "TI-1",
    date: "2026-01-15",
    finalAmount: 10.5 * LAKH,
  });
  const second = ti({
    id: "ti-2",
    number: "TI-2",
    date: "2026-02-15",
    finalAmount: 15 * LAKH,
  });
  const payments = [
    linked("p1", first.id, 11 * LAKH),
    linked("p2", second.id, 14.5 * LAKH),
  ];
  const before = JSON.stringify(payments);
  const file = data([first, second], payments);

  assert.equal(invoiceOutstanding(first, file), 0);
  assert.equal(invoiceOutstanding(second, file), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(first, file)), "Paid");
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(second, file)), "Paid");
  assert.equal(outstandingIsStillDue(invoiceOutstanding(first, file)), false);
  assert.equal(outstandingIsStillDue(invoiceOutstanding(second, file)), false);

  const rows = buildInvoiceOutstandingRows(file);
  assert.deepEqual(
    rows.map((row) => [row.invoiceId, row.outstanding, row.status]),
    [
      ["ti-1", 0, "paid"],
      ["ti-2", 0, "paid"],
    ]
  );
  assert.equal(sumOpenOutstanding(rows), 0);

  const detail = buildReconciliationDetail("c", file);
  assert.equal(detail?.tis[0]?.outstanding, 0);
  assert.equal(detail?.tis[1]?.outstanding, 0);
  assert.equal(detail?.totals.outstanding, 0);
  assert.equal(JSON.stringify(payments), before);
  assert.equal(payments[0]?.invoiceId, first.id);
  assert.equal(payments[0]?.netAmount, 11 * LAKH);
  assert.equal(payments[1]?.invoiceId, second.id);
  assert.equal(payments[1]?.netAmount, 14.5 * LAKH);

  const entry = {
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    recovered: 0,
    showRecovered: false,
  };
  assert.equal(
    taxInvoiceEntryStatus(file, first, { ...entry, netAmount: 11 * LAKH }, "p1"),
    "Match"
  );
  assert.equal(
    taxInvoiceEntryStatus(file, second, { ...entry, netAmount: 14.5 * LAKH }, "p2"),
    "Match"
  );
});

test("leftover linked spare stays Extra, and a partial cover stays Due", () => {
  const over = ti({ id: "over", date: "2026-01-01", finalAmount: 100_000 });
  const short = ti({ id: "short", date: "2026-02-01", finalAmount: 100_000 });

  const wide = data(
    [over, short],
    [linked("p-over", over.id, 180_000), linked("p-short", short.id, 50_000)]
  );
  assert.equal(invoiceOutstanding(short, wide), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(short, wide)), "Paid");
  assert.equal(invoiceOutstanding(over, wide), -30_000);
  assert.equal(
    invoiceBalanceLabel(invoiceOutstanding(over, wide)),
    `Extra ${formatMoney(30_000)}`
  );
  assert.equal(sumOpenOutstanding(buildInvoiceOutstandingRows(wide)), 0);
  const boxes = {
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    recovered: 0,
    showRecovered: false,
  };
  assert.equal(
    taxInvoiceEntryStatus(wide, over, { ...boxes, netAmount: 180_000 }, "p-over"),
    `Over by ${formatMoney(30_000)}`
  );
  assert.equal(
    taxInvoiceEntryStatus(wide, short, { ...boxes, netAmount: 50_000 }, "p-short"),
    "Match"
  );

  const narrow = data(
    [over, short],
    [linked("p-over", over.id, 120_000), linked("p-short", short.id, 50_000)]
  );
  assert.equal(invoiceOutstanding(short, narrow), 30_000);
  assert.equal(
    invoiceBalanceLabel(invoiceOutstanding(short, narrow)),
    `Due ${formatMoney(30_000)}`
  );
  assert.equal(invoiceOutstanding(over, narrow), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(over, narrow)), "Paid");
  assert.equal(outstandingIsStillDue(30_000), true);
  assert.equal(sumOpenOutstanding(buildInvoiceOutstandingRows(narrow)), 30_000);
  assert.equal(
    taxInvoiceEntryStatus(narrow, short, { ...boxes, netAmount: 50_000 }, "p-short"),
    `Short by ${formatMoney(30_000)}`
  );
  assert.equal(
    taxInvoiceEntryStatus(narrow, over, { ...boxes, netAmount: 120_000 }, "p-over"),
    "Match"
  );
  assert.equal(
    invoiceOutstandingStatus(30_000, 50_000, "2026-12-01", "2026-10-26"),
    "partially paid"
  );
  assert.equal(
    invoiceOutstandingStatus(30_000, 50_000, "2026-01-01", "2026-10-26"),
    "overdue"
  );
});

test("oldest short is covered first, and oldest spare is used first", () => {
  const spare = ti({ id: "spare", number: "TI-S", date: "2026-01-01", finalAmount: 10_000 });
  const earlyNumber = ti({
    id: "early-number",
    number: "TI-1",
    date: "2026-05-01",
    createdAt: "2026-05-01T00:00:02.000Z",
    finalAmount: 40_000,
  });
  const laterNumber = ti({
    id: "later-number",
    number: "TI-2",
    date: "2026-05-01",
    createdAt: "2026-05-01T00:00:01.000Z",
    finalAmount: 40_000,
  });
  const file = data(
    [laterNumber, earlyNumber, spare],
    [
      linked("p-spare", spare.id, 60_000),
      linked("p-early", earlyNumber.id, 0),
      linked("p-later", laterNumber.id, 0),
    ]
  );
  assert.equal(invoiceOutstanding(earlyNumber, file), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(earlyNumber, file)), "Paid");
  assert.equal(invoiceOutstanding(laterNumber, file), 30_000);
  assert.equal(invoiceOutstanding(spare, file), 0);

  const olderSpare = ti({
    id: "older-spare",
    date: "2026-01-01",
    finalAmount: 10_000,
  });
  const newerSpare = ti({
    id: "newer-spare",
    date: "2026-02-01",
    finalAmount: 10_000,
  });
  const onlyShort = ti({
    id: "only-short",
    date: "2026-03-01",
    finalAmount: 40_000,
  });
  const ordered = data(
    [newerSpare, onlyShort, olderSpare],
    [
      linked("p-old", olderSpare.id, 40_000),
      linked("p-new", newerSpare.id, 40_000),
      linked("p-short", onlyShort.id, 0),
    ]
  );
  assert.equal(invoiceOutstanding(onlyShort, ordered), 0);
  assert.equal(invoiceOutstanding(olderSpare, ordered), 0);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(olderSpare, ordered)), "Paid");
  assert.equal(invoiceOutstanding(newerSpare, ordered), -20_000);
  assert.match(invoiceBalanceLabel(invoiceOutstanding(newerSpare, ordered)), /^Extra /);
});

test("the Rs 200 band applies to the due left after linked spare", () => {
  const over = ti({ id: "over", date: "2026-01-01", finalAmount: 1_000 });
  const short = ti({ id: "short", date: "2026-02-01", finalAmount: 50_000 });
  const within = data(
    [over, short],
    [linked("p-over", over.id, 1_000 + 49_800), linked("p-short", short.id, 0)]
  );
  assert.equal(invoiceOutstanding(short, within), 200);
  assert.equal(invoiceBalanceLabel(invoiceOutstanding(short, within)), "Paid");
  assert.equal(outstandingIsStillDue(invoiceOutstanding(short, within)), false);
  assert.equal(sumOpenOutstanding(buildInvoiceOutstandingRows(within)), 0);

  const pastBand = data(
    [over, short],
    [linked("p-over", over.id, 1_000 + 49_799.99), linked("p-short", short.id, 0)]
  );
  const left = invoiceOutstanding(short, pastBand);
  assert.ok(Math.abs(left - 200.01) < 0.001);
  assert.match(invoiceBalanceLabel(left), /^Due /);
  assert.equal(outstandingIsStillDue(left), true);
  assert.ok(Math.abs(sumOpenOutstanding(buildInvoiceOutstandingRows(pastBand)) - 200.01) < 0.001);
  assert.equal(outstandingIsStillDue(50_000), true);
});

test("linked spare does not cross contracts", () => {
  const home = ti({ id: "home", contractId: "home", finalAmount: 10_000 });
  const other = ti({ id: "other", contractId: "other", finalAmount: 10_000 });
  const file = data(
    [home, other],
    [
      linked("p-home", home.id, 15_000, { contractId: "home" }),
      linked("p-other", other.id, 4_000, { contractId: "other" }),
    ],
    [contract("home"), contract("other")]
  );
  assert.equal(invoiceOutstanding(home, file), -5_000);
  assert.match(invoiceBalanceLabel(invoiceOutstanding(home, file)), /^Extra /);
  assert.equal(invoiceOutstanding(other, file), 6_000);
  assert.match(invoiceBalanceLabel(invoiceOutstanding(other, file)), /^Due /);
});

test("retention and TDS stay on the linked payment that recorded them", () => {
  const over = ti({ id: "over", date: "2026-01-01", finalAmount: 1_000 });
  const short = ti({ id: "short", date: "2026-02-01", finalAmount: 1_000 });
  const overPay = linked("p-over", over.id, 1_100, {
    retentionAmount: 50,
    tdsAmount: 25,
  });
  const shortPay = linked("p-short", short.id, 900);
  const file = data([over, short], [overPay, shortPay]);
  assert.equal(invoiceOutstanding(short, file), 0);
  assert.equal(invoiceOutstanding(over, file), -75);
  assert.equal(overPay.retentionAmount, 50);
  assert.equal(overPay.tdsAmount, 25);
  assert.equal(shortPay.retentionAmount, 0);
  assert.equal(invoiceActualRetentionHold(over, file), 50);
  assert.equal(invoiceActualRetentionHold(short, file), 0);
});

test("an unlinked 50000 still fills the next invoice that needs it", () => {
  const older = ti({
    id: "older",
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    finalAmount: 100_000,
  });
  const newer = ti({
    id: "newer",
    date: "2026-03-01",
    createdAt: "2026-03-01T00:00:00.000Z",
    finalAmount: 100_000,
  });
  const unlinked = pay({ id: "u", netAmount: 50_000 });
  const open = data([newer, older], [linked("p-older", older.id, 100_000), unlinked]);
  assert.equal(invoiceOutstanding(older, open), 0);
  assert.equal(invoiceOutstanding(newer, open), 50_000);
  assert.equal(invoicePaidAmount(newer, open), 50_000);
  assert.equal(invoicePaidAmount(older, open), 100_000);
  assert.equal(unlinked.invoiceId, null);
  assert.equal(unlinked.link, "unlinked");

  const bothShort = data([older, newer], [unlinked]);
  assert.equal(invoiceOutstanding(older, bothShort), 50_000);
  assert.equal(invoiceOutstanding(newer, bothShort), 100_000);
  assert.equal(invoicePaidAmount(older, bothShort), 50_000);
  assert.equal(invoicePaidAmount(newer, bothShort), 0);
  assert.match(invoiceBalanceLabel(invoiceOutstanding(older, bothShort)), /^Due /);
  assert.doesNotMatch(invoiceBalanceLabel(invoiceOutstanding(newer, bothShort)), /Extra/);
});

test("linked spare does not move an unlinked fill off the invoice that needs it", () => {
  const older = ti({ id: "older", date: "2026-01-01", finalAmount: 100_000 });
  const newer = ti({ id: "newer", date: "2026-03-01", finalAmount: 100_000 });
  const file = data(
    [older, newer],
    [linked("p-new", newer.id, 180_000), pay({ id: "u", netAmount: 50_000 })]
  );
  assert.equal(invoicePaidAmount(older, file), 50_000);
  assert.equal(invoicePaidAmount(newer, file), 180_000);
  assert.equal(invoiceOutstanding(older, file), 0);
  assert.equal(invoiceOutstanding(newer, file), -30_000);
});
