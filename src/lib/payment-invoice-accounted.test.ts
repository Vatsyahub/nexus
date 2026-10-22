import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney } from "@/lib/format-money";
import {
  entryAccountedTowardInvoice,
  paymentAccounted,
  savedTaxInvoiceAccounted,
  taxInvoiceAccountedStatus,
  type TaxInvoiceAccountedEntry,
} from "@/lib/store";
import type { Payment } from "@/lib/types";

const INVOICE_FINAL = 504_450;

function pay(partial: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    contractId: "c",
    invoiceId: "ti",
    link: "TI",
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

function entry(
  partial: Partial<TaxInvoiceAccountedEntry> = {}
): TaxInvoiceAccountedEntry {
  return {
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    recovered: 0,
    showRecovered: true,
    ...partial,
  };
}

/** The saved Godrej line: net, GST, retention, TDS, recovered, other 0. */
function savedGodrej(): Payment {
  return pay({
    id: "saved",
    netAmount: 326_732,
    gstAmount: 76_950,
    retentionAmount: 21_375,
    tdsAmount: 7_328.71,
    otherDeductions: 0,
    otherDeductionReason: "reason is not part of the sum",
    recovered: 72_064.29,
  });
}

function toward(
  payments: Payment[],
  invoiceId: string,
  exceptPaymentId: string | null,
  boxes: TaxInvoiceAccountedEntry
) {
  return (
    savedTaxInvoiceAccounted(payments, invoiceId, exceptPaymentId) +
    entryAccountedTowardInvoice(boxes)
  );
}

test("tax invoice accounted sum matches the invoice, then the open form", () => {
  const saved = savedGodrej();
  assert.equal(paymentAccounted(saved), INVOICE_FINAL);

  const zeros = toward([saved], "ti", null, entry());
  assert.equal(zeros, INVOICE_FINAL);
  assert.equal(taxInvoiceAccountedStatus(INVOICE_FINAL, zeros), "Match");

  const over = toward([saved], "ti", null, entry({ netAmount: 100 }));
  assert.equal(over, INVOICE_FINAL + 100);
  assert.equal(
    taxInvoiceAccountedStatus(INVOICE_FINAL, over),
    `Over by ${formatMoney(100)}`
  );

  const editing = toward([saved], "ti", saved.id, entry({
    netAmount: saved.netAmount,
    gstAmount: saved.gstAmount,
    retentionAmount: saved.retentionAmount,
    tdsAmount: saved.tdsAmount,
    otherDeductions: saved.otherDeductions,
    recovered: saved.recovered,
    showRecovered: true,
  }));
  assert.equal(savedTaxInvoiceAccounted([saved], "ti", saved.id), 0);
  assert.equal(editing, INVOICE_FINAL);
  assert.equal(taxInvoiceAccountedStatus(INVOICE_FINAL, editing), "Match");

  const onlyForm = toward([], "ti", null, entry({ netAmount: 100 }));
  assert.equal(savedTaxInvoiceAccounted([], "ti"), 0);
  assert.equal(onlyForm, 100);
  assert.equal(
    taxInvoiceAccountedStatus(INVOICE_FINAL, onlyForm),
    `Short by ${formatMoney(INVOICE_FINAL - 100)}`
  );
});

test("hidden Recovered adds 0 and other links stay out of the starting point", () => {
  const saved = savedGodrej();
  const hidden = entryAccountedTowardInvoice(
    entry({ recovered: 72_064.29, showRecovered: false })
  );
  assert.equal(hidden, 0);
  assert.equal(
    toward([saved], "ti", null, entry({ recovered: 50, showRecovered: false })),
    INVOICE_FINAL
  );

  const recoverable = pay({
    id: "pool",
    link: "recoverable",
    invoiceId: "ti",
    netAmount: 90_000,
    gstAmount: 10_000,
    recovered: 1_000,
  });
  const proforma = pay({
    id: "pi",
    link: "PI",
    invoiceId: "ti",
    netAmount: 40_000,
  });
  const unlinked = pay({
    id: "free",
    link: "unlinked",
    invoiceId: null,
    netAmount: 25_000,
    retentionAmount: 500,
  });
  assert.equal(
    savedTaxInvoiceAccounted([saved, recoverable, proforma, unlinked], "ti"),
    INVOICE_FINAL
  );
});

test("editing onto another tax invoice keeps the open payment out of that start", () => {
  const open = savedGodrej();
  const other = pay({
    id: "other",
    invoiceId: "ti-2",
    netAmount: 1_000,
    gstAmount: 180,
  });
  const start = savedTaxInvoiceAccounted([open, other], "ti-2", open.id);
  assert.equal(start, paymentAccounted(other));
  assert.equal(start, 1_180);

  const pointed = toward([open, other], "ti-2", open.id, entry({ netAmount: 100 }));
  assert.equal(pointed, 1_280);
  assert.equal(
    taxInvoiceAccountedStatus(2_000, pointed),
    `Short by ${formatMoney(720)}`
  );
});

test("half a paisa still matches, and a wider gap names Over by or Short by", () => {
  assert.equal(taxInvoiceAccountedStatus(0, 0.005), "Match");
  assert.equal(taxInvoiceAccountedStatus(0, -0.005), "Match");
  assert.equal(taxInvoiceAccountedStatus(INVOICE_FINAL, INVOICE_FINAL), "Match");
  assert.equal(
    taxInvoiceAccountedStatus(0, 0.006),
    `Over by ${formatMoney(0.006)}`
  );
  assert.equal(
    taxInvoiceAccountedStatus(0, -0.006),
    `Short by ${formatMoney(0.006)}`
  );
});
