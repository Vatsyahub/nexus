import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";
import {
  buildCollectionRows,
  collectionCashReceived,
  filterCollectionRows,
  sumCollectionCashReceived,
} from "@/lib/reports";

function contract(
  partial: Pick<Contract, "id"> & Partial<Contract>
): Contract {
  return {
    projectNo: "P-1",
    projectName: "Alpha works",
    city: "Pune",
    orderValue: 1000,
    ...partial,
  } as Contract;
}

function invoice(
  partial: Pick<Invoice, "id" | "contractId" | "type" | "number"> &
    Partial<Invoice>
): Invoice {
  return {
    date: "2026-01-01",
    lines: [],
    netAmount: 0,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 0,
    convertedFromPiId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function pay(
  partial: Omit<Partial<Payment>, "link"> &
    Pick<Payment, "id" | "contractId"> & {
      link?: string;
      recovered?: number;
    }
): Payment {
  return {
    invoiceId: null,
    link: "unlinked",
    date: "2026-03-01",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...partial,
  } as Payment;
}

function workspace(
  contracts: Contract[],
  invoices: Invoice[],
  payments: Payment[]
): FlowhubData {
  return { contracts, invoices, payments } as FlowhubData;
}

test("collection rows cover tax invoice, proforma, unlinked, and recoverable", () => {
  const alpha = contract({
    id: "c-alpha",
    projectNo: "P-1",
    projectName: "Alpha works",
  });
  const beta = contract({
    id: "c-beta",
    projectNo: "P-2",
    projectName: "Beta site",
  });
  const ti = invoice({
    id: "inv-ti",
    contractId: alpha.id,
    type: "TI",
    number: "TI-104",
  });
  const pi = invoice({
    id: "inv-pi",
    contractId: beta.id,
    type: "PI",
    number: "PI-17",
  });
  const rows = buildCollectionRows(
    workspace(
      [alpha, beta],
      [ti, pi],
      [
        pay({
          id: "old",
          contractId: alpha.id,
          invoiceId: ti.id,
          link: "TI",
          date: "2026-01-15",
          createdAt: "2026-01-15T00:00:00.000Z",
          netAmount: 1000,
          gstAmount: 180,
          retentionAmount: 50,
          tdsAmount: 20,
          otherDeductions: 5,
        }),
        pay({
          id: "proforma",
          contractId: beta.id,
          invoiceId: pi.id,
          link: "PI",
          date: "2026-02-02",
          createdAt: "2026-02-02T00:00:00.000Z",
          netAmount: 400,
          gstAmount: 72,
          retentionAmount: 10,
          tdsAmount: 8,
          otherDeductions: 3,
        }),
        pay({
          id: "open",
          contractId: alpha.id,
          link: "unlinked",
          date: "2026-02-02",
          createdAt: "2026-02-02T01:00:00.000Z",
          netAmount: 25,
          gstAmount: 0,
        }),
        pay({
          id: "recover",
          contractId: alpha.id,
          invoiceId: ti.id,
          link: "recoverable",
          date: "2026-04-01",
          createdAt: "2026-04-01T00:00:00.000Z",
          netAmount: 200,
          gstAmount: 36,
          retentionAmount: 15,
          tdsAmount: 4,
          otherDeductions: 7,
          recovered: 999,
        }),
      ]
    )
  );

  assert.deepEqual(
    rows.map((r) => r.paymentId),
    ["recover", "open", "proforma", "old"]
  );

  const byId = new Map(rows.map((r) => [r.paymentId, r]));
  const tax = byId.get("old")!;
  assert.equal(tax.against, "TI-104");
  assert.equal(tax.invoiceId, "inv-ti");
  assert.equal(tax.projectName, "Alpha works");
  assert.equal(tax.cashReceived, 1180);
  assert.equal(tax.retention, 50);
  assert.equal(tax.tds, 20);
  assert.equal(tax.otherDeductions, 5);

  const proforma = byId.get("proforma")!;
  assert.equal(proforma.against, "PI-17");
  assert.equal(proforma.invoiceId, "inv-pi");
  assert.equal(proforma.cashReceived, 472);

  const unlinked = byId.get("open")!;
  assert.equal(unlinked.against, "Unlinked");
  assert.equal(unlinked.invoiceId, null);
  assert.equal(unlinked.cashReceived, 25);

  const recoverable = byId.get("recover")!;
  assert.equal(recoverable.against, "Recoverable");
  assert.equal(recoverable.invoiceId, null);
  assert.equal(recoverable.cashReceived, 236);
  assert.equal(recoverable.otherDeductions, 7);
  assert.equal(recoverable.retention, 15);
  assert.equal(recoverable.tds, 4);

  assert.equal(sumCollectionCashReceived(rows), 1180 + 472 + 25 + 236);
  assert.equal(
    sumCollectionCashReceived(rows),
    rows.reduce((s, r) => s + r.cashReceived, 0)
  );
});

test("a missing payment link still resolves today's invoice or unlinked", () => {
  const c = contract({ id: "c1", projectNo: "P-9", projectName: "Gamma" });
  const ti = invoice({
    id: "ti-1",
    contractId: c.id,
    type: "TI",
    number: "TI-9",
  });
  const linked = pay({
    id: "legacy",
    contractId: c.id,
    invoiceId: ti.id,
    date: "2026-05-01",
  });
  delete (linked as { link?: string }).link;
  const loose = pay({
    id: "loose",
    contractId: c.id,
    invoiceId: null,
    date: "2026-05-02",
  });
  delete (loose as { link?: string }).link;

  const rows = buildCollectionRows(workspace([c], [ti], [linked, loose]));
  const byId = new Map(rows.map((r) => [r.paymentId, r]));
  assert.equal(byId.get("legacy")?.against, "TI-9");
  assert.equal(byId.get("loose")?.against, "Unlinked");
});

test("cash received ignores a recovered field", () => {
  const payment = pay({
    id: "p",
    contractId: "c",
    netAmount: 80,
    gstAmount: 14.4,
    otherDeductions: 6,
    retentionAmount: 2,
    tdsAmount: 1,
    recovered: 40,
  });
  assert.equal(collectionCashReceived(payment), 94.4);
  const [row] = buildCollectionRows(workspace([], [], [payment]));
  assert.equal(row.cashReceived, 94.4);
  assert.equal(row.otherDeductions, 6);
  assert.equal(row.retention, 2);
  assert.equal(row.tds, 1);
  assert.equal(row.projectNo, "—");
  assert.equal(row.contractId, "");
});

test("search and payment-date range narrow the cash total", () => {
  const c = contract({ id: "c1", projectNo: "PX", projectName: "Yard" });
  const rows = buildCollectionRows(
    workspace(
      [c],
      [],
      [
        pay({
          id: "a",
          contractId: c.id,
          date: "2026-01-10",
          netAmount: 100,
          gstAmount: 18,
          retentionAmount: 40,
          link: "unlinked",
        }),
        pay({
          id: "b",
          contractId: c.id,
          date: "2026-01-20",
          netAmount: 50,
          gstAmount: 0,
          link: "recoverable",
          recovered: 40,
        }),
        pay({
          id: "c",
          contractId: c.id,
          date: "2026-02-01",
          netAmount: 10,
          gstAmount: 0,
          link: "unlinked",
        }),
      ]
    )
  );

  const january = filterCollectionRows(rows, {
    dateFrom: "2026-01-10",
    dateTo: "2026-01-20",
  });
  assert.deepEqual(
    january.map((r) => r.paymentId),
    ["b", "a"]
  );
  assert.equal(sumCollectionCashReceived(january), 168);

  const openStart = filterCollectionRows(rows, { dateTo: "2026-01-10" });
  assert.deepEqual(
    openStart.map((r) => r.paymentId),
    ["a"]
  );
  const openEnd = filterCollectionRows(rows, { dateFrom: "2026-02-01" });
  assert.deepEqual(
    openEnd.map((r) => r.paymentId),
    ["c"]
  );

  const recoverable = filterCollectionRows(rows, { q: "recoverable" });
  assert.deepEqual(
    recoverable.map((r) => r.paymentId),
    ["b"]
  );
  assert.equal(sumCollectionCashReceived(recoverable), 50);

  const byRetention = filterCollectionRows(rows, { q: "40" });
  assert.deepEqual(
    byRetention.map((r) => r.paymentId),
    ["a"]
  );

  const byProject = filterCollectionRows(rows, { q: "yard" });
  assert.equal(byProject.length, 3);

  const none = filterCollectionRows(rows, {
    q: "TI-missing",
    dateFrom: "2026-01-01",
    dateTo: "2026-12-31",
  });
  assert.equal(none.length, 0);
  assert.equal(sumCollectionCashReceived(none), 0);
});
