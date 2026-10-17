import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";
import {
  addContract,
  addInvoice,
  addPayment,
  applyPaymentEntry,
  contractActualRetentionHold,
  contractRecoverablePool,
  contractRecoveredTotal,
  deletePayment,
  getData,
  invoiceOutstanding,
  paymentCash,
  paymentTowardOutstanding,
  recoverablePoolHolds,
  recoverableRunningLineFigures,
  updatePayment,
} from "@/lib/store";

function contract(
  partial: Pick<Contract, "id"> & Partial<Contract>
): Contract {
  return {
    projectNo: partial.id,
    projectName: partial.id,
    city: "Delhi",
    orderValue: 10_000,
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

test("recoverable cash does not reduce any tax invoice and is not in the unlinked FIFO", () => {
  const c = contract({ id: "c-fifo" });
  const first = ti({
    id: "ti-old",
    contractId: c.id,
    date: "2026-01-01",
    createdAt: "2026-01-01T00:00:00.000Z",
    netAmount: 100,
  });
  const second = ti({
    id: "ti-new",
    contractId: c.id,
    date: "2026-02-01",
    createdAt: "2026-02-01T00:00:00.000Z",
    netAmount: 100,
  });
  const recoverable = pay({
    id: "rec",
    contractId: c.id,
    link: "recoverable",
    date: "2025-12-01",
    netAmount: 80,
    gstAmount: 20,
    otherDeductions: 50,
    retentionAmount: 10,
    tdsAmount: 10,
    recovered: 999,
  });
  const unlinked = pay({
    id: "un",
    contractId: c.id,
    link: "unlinked",
    date: "2026-03-01",
    netAmount: 60,
  });
  const proforma = pay({
    id: "pi",
    contractId: c.id,
    link: "PI",
    invoiceId: "pi-1",
    netAmount: 40,
    recovered: 40,
  });
  const data = workspace([c], [first, second], [recoverable, unlinked, proforma]);

  assert.equal(paymentTowardOutstanding(recoverable), 150);
  assert.equal(paymentCash(recoverable), 100);
  assert.equal(invoiceOutstanding(first, data), 40);
  assert.equal(invoiceOutstanding(second, data), 100);
  assert.equal(
    contractActualRetentionHold(c.id, data),
    0
  );
});

test("recovered reduces that tax invoice outstanding like other deductions", () => {
  const c = contract({ id: "c-rec" });
  const invoice = ti({
    id: "ti",
    contractId: c.id,
    netAmount: 1000,
  });
  const linked = pay({
    id: "p",
    contractId: c.id,
    invoiceId: invoice.id,
    link: "TI",
    netAmount: 100,
    gstAmount: 20,
    otherDeductions: 30,
    recovered: 40,
    retentionAmount: 500,
    tdsAmount: 500,
  });
  const asOther = pay({
    ...linked,
    id: "p-other",
    otherDeductions: 70,
    recovered: 0,
  });
  const holdsOnly = pay({
    ...linked,
    id: "p-holds",
    netAmount: 0,
    gstAmount: 0,
    otherDeductions: 0,
    recovered: 0,
  });
  const proforma = pay({
    id: "pi",
    contractId: c.id,
    invoiceId: "pi-1",
    link: "PI",
    netAmount: 100,
    gstAmount: 20,
    otherDeductions: 30,
    recovered: 40,
  });

  assert.equal(paymentTowardOutstanding(linked), 190);
  assert.equal(paymentTowardOutstanding(asOther), 190);
  assert.equal(paymentCash(linked), 120);
  assert.equal(
    invoiceOutstanding(invoice, workspace([c], [invoice], [linked])),
    810
  );
  assert.equal(
    invoiceOutstanding(invoice, workspace([c], [invoice], [linked])),
    invoiceOutstanding(invoice, workspace([c], [invoice], [asOther]))
  );
  assert.equal(
    invoiceOutstanding(invoice, workspace([c], [invoice], [holdsOnly])),
    1000
  );
  assert.equal(
    invoiceOutstanding(invoice, workspace([c], [invoice], [proforma])),
    1000
  );
  assert.equal(paymentTowardOutstanding(unlinkedRecovered()), 10);
});

function unlinkedRecovered(): Payment {
  return pay({
    id: "un-rec",
    contractId: "c-rec",
    link: "unlinked",
    netAmount: 10,
    recovered: 25,
  });
}

test("the pool is net plus GST of recoverable payments only", () => {
  const payments = [
    pay({
      id: "r1",
      contractId: "c",
      link: "recoverable",
      netAmount: 40,
      gstAmount: 10,
      retentionAmount: 999,
      tdsAmount: 999,
      otherDeductions: 999,
    }),
    pay({
      id: "r2",
      contractId: "c",
      link: "recoverable",
      netAmount: 20,
      gstAmount: 5,
    }),
    pay({
      id: "ti",
      contractId: "c",
      link: "TI",
      invoiceId: "ti",
      netAmount: 500,
      gstAmount: 90,
      recovered: 15,
    }),
    pay({
      id: "un",
      contractId: "c",
      link: "unlinked",
      netAmount: 200,
      gstAmount: 36,
      recovered: 50,
    }),
    pay({
      id: "pi",
      contractId: "c",
      link: "PI",
      invoiceId: "pi",
      netAmount: 10,
      gstAmount: 2,
      recovered: 8,
    }),
    pay({
      id: "other-contract",
      contractId: "other",
      link: "recoverable",
      netAmount: 1000,
      gstAmount: 0,
    }),
  ];
  assert.equal(contractRecoverablePool(payments, "c"), 75);
  assert.equal(contractRecoveredTotal(payments, "c"), 15);
});

test("recovered cannot exceed the remaining pool", () => {
  const payments = [
    pay({
      id: "pool",
      contractId: "c",
      link: "recoverable",
      netAmount: 70,
      gstAmount: 30,
    }),
    pay({
      id: "a",
      contractId: "c",
      link: "TI",
      invoiceId: "ti-a",
      recovered: 40,
    }),
  ];
  const entry = pay({
    id: "b",
    contractId: "c",
    link: "TI",
    invoiceId: "ti-b",
  });
  const within = applyPaymentEntry(payments, { ...entry, recovered: 60 });
  const over = applyPaymentEntry(payments, { ...entry, recovered: 60.01 });
  assert.equal(contractRecoveredTotal(within, "c"), 100);
  assert.equal(recoverablePoolHolds(within, "c"), true);
  assert.equal(recoverablePoolHolds(over, "c"), false);

  const shrunk = applyPaymentEntry(payments, {
    ...payments[0],
    netAmount: 30,
    gstAmount: 0,
  });
  assert.equal(contractRecoverablePool(shrunk, "c"), 30);
  assert.equal(recoverablePoolHolds(shrunk, "c"), false);
});

test("editing does not double-count this payment's own recovered amount", () => {
  const payments = [
    pay({
      id: "pool",
      contractId: "c",
      link: "recoverable",
      netAmount: 100,
      gstAmount: 0,
    }),
    pay({
      id: "a",
      contractId: "c",
      link: "TI",
      invoiceId: "ti-a",
      recovered: 40,
    }),
    pay({
      id: "b",
      contractId: "c",
      link: "TI",
      invoiceId: "ti-b",
      recovered: 30,
    }),
  ];
  const open = recoverableRunningLineFigures(payments, "c", {
    exceptPaymentId: "b",
    thisEntry: 30,
  });
  assert.deepEqual(open, { pool: 100, recovered: 70, left: 30 });

  const raised = recoverableRunningLineFigures(payments, "c", {
    exceptPaymentId: "b",
    thisEntry: 60,
  });
  assert.deepEqual(raised, { pool: 100, recovered: 100, left: 0 });

  const saved = applyPaymentEntry(payments, {
    ...payments[2],
    recovered: 60,
  });
  assert.equal(contractRecoveredTotal(saved, "c"), 100);
  assert.equal(recoverablePoolHolds(saved, "c"), true);

  const tooHigh = applyPaymentEntry(payments, {
    ...payments[2],
    recovered: 61,
  });
  assert.equal(contractRecoveredTotal(tooHigh, "c"), 101);
  assert.equal(recoverablePoolHolds(tooHigh, "c"), false);

  const cash = recoverableRunningLineFigures(payments, "c", {
    openRecoverableCash: { paymentId: "pool", net: 80, gst: 0 },
  });
  assert.equal(cash.pool, 80);
  assert.equal(cash.recovered, 70);
  assert.equal(cash.left, 10);
});

test("add and update reject recovered above the pool without counting an edit twice", () => {
  const created = addContract({
    projectName: "Recoverable pool",
    projectNo: `C-REC-${Date.now()}`,
    orderNos: "T-REC",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 5000,
    gstApplicable: false,
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
        id: "boq-rec",
        catalogKey: "item-rec",
        name: "Recoverable item",
        unit: "Nos",
        rate: 1000,
        quantity: 1,
      },
    ],
  });
  const contractId = created.contract.id;
  const line = {
    boqItemId: "boq-rec",
    itemName: "Recoverable item",
    termKey: "supply",
    billedQty: 1,
    rate: 1000,
    termPercent: 100,
    lineNet: 1000,
  };
  const older = addInvoice({
    type: "TI",
    number: "TI-REC-OLD",
    date: "2026-01-01",
    contractId,
    lines: [line],
  });
  const newer = addInvoice({
    type: "TI",
    number: "TI-REC-NEW",
    date: "2026-02-01",
    contractId,
    lines: [line],
  });
  assert.ok(older);
  assert.ok(newer);
  const before = invoiceOutstanding(older, getData());

  const pool = addPayment({
    contractId,
    invoiceId: older.id,
    link: "recoverable",
    date: "2026-01-15",
    netAmount: 80,
    gstAmount: 20,
    retentionAmount: 5,
    tdsAmount: 5,
    otherDeductions: 5,
    otherDeductionReason: "",
    recovered: 999,
  });
  assert.ok(pool);
  assert.equal(pool.link, "recoverable");
  assert.equal(pool.invoiceId, null);
  assert.equal(pool.recovered, 0);
  assert.equal(invoiceOutstanding(older, getData()), before);
  assert.equal(invoiceOutstanding(newer, getData()), before);

  const unlinked = addPayment({
    contractId,
    invoiceId: null,
    link: "unlinked",
    date: "2026-03-01",
    netAmount: 100,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 40,
  });
  assert.ok(unlinked);
  assert.equal(unlinked.recovered, 0);
  assert.equal(invoiceOutstanding(older, getData()), before - 100);
  assert.equal(invoiceOutstanding(newer, getData()), before);

  const base = {
    contractId,
    date: "2026-03-02",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
  };
  const first = addPayment({
    ...base,
    invoiceId: newer.id,
    link: "TI",
    recovered: 60,
  });
  assert.ok(first);
  assert.equal(first.recovered, 60);
  assert.equal(invoiceOutstanding(newer, getData()), before - 60);

  const tooMuch = addPayment({
    ...base,
    invoiceId: older.id,
    link: "TI",
    recovered: 50,
  });
  assert.equal(tooMuch, null);

  const second = addPayment({
    ...base,
    invoiceId: older.id,
    link: "TI",
    recovered: 40,
  });
  assert.ok(second);
  assert.equal(invoiceOutstanding(older, getData()), before - 100 - 40);

  const doubled = updatePayment(first.id, { ...base, invoiceId: newer.id, link: "TI", recovered: 61 });
  assert.equal(doubled, null);
  assert.equal(getData().payments.find((p) => p.id === first.id)?.recovered, 60);

  const edited = updatePayment(first.id, { ...base, invoiceId: newer.id, link: "TI", recovered: 60 });
  assert.ok(edited);
  assert.equal(edited.recovered, 60);
  assert.equal(contractRecoveredTotal(getData().payments, contractId), 100);

  const shortCash = updatePayment(pool.id, {
    ...base,
    invoiceId: null,
    link: "recoverable",
    netAmount: 50,
    gstAmount: 0,
    recovered: 0,
  });
  assert.equal(shortCash, null);
  assert.equal(getData().payments.find((p) => p.id === pool.id)?.netAmount, 80);
});

test("deleting recoverable cash is refused while tax invoices still recover it", () => {
  const created = addContract({
    projectName: "Delete pool",
    projectNo: `C-DEL-${Date.now()}`,
    orderNos: "T-DEL",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
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
        id: "boq-del",
        catalogKey: "item-del",
        name: "Delete item",
        unit: "Nos",
        rate: 1000,
        quantity: 1,
      },
    ],
  });
  const contractId = created.contract.id;
  const invoice = addInvoice({
    type: "TI",
    number: "TI-DEL",
    date: "2026-01-01",
    contractId,
    lines: [
      {
        boqItemId: "boq-del",
        itemName: "Delete item",
        termKey: "supply",
        billedQty: 1,
        rate: 1000,
        termPercent: 100,
        lineNet: 1000,
      },
    ],
  });
  assert.ok(invoice);
  const pool = addPayment({
    contractId,
    invoiceId: null,
    link: "recoverable",
    date: "2026-01-02",
    netAmount: 100,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
  });
  const recovered = addPayment({
    contractId,
    invoiceId: invoice.id,
    link: "TI",
    date: "2026-01-03",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 40,
  });
  assert.ok(pool);
  assert.ok(recovered);
  assert.equal(deletePayment(pool.id), false);
  assert.equal(getData().payments.some((p) => p.id === pool.id), true);
  assert.equal(deletePayment(recovered.id), true);
  assert.equal(deletePayment(pool.id), true);
  assert.equal(getData().payments.some((p) => p.id === pool.id), false);
});
