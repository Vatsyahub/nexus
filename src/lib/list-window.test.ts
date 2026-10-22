import assert from "node:assert/strict";
import test from "node:test";
import {
  LIST_WINDOW_LIMIT,
  LIST_WINDOW_ORDER,
  listIsFiltered,
  listWindowNote,
  wholeUntilFiltered,
  windowList,
} from "@/lib/list-window";
import {
  collectionCashReceived,
  sumCollectionColumns,
  sumOpenOutstanding,
  sumSalesInvoiceNet,
  type CollectionReportRow,
  type InvoiceOutstandingRow,
  type SalesInvoiceRow,
} from "@/lib/reports";
import { outstandingIsStillDue } from "@/lib/store";
import type { Payment } from "@/lib/types";

const TODAY = "2026-10-22";

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

type Dated = { id: string; date: string; createdAt?: string };

/** `count` rows ending on `end`, oldest first. One calendar day apart. */
function span(count: number, end: string): Dated[] {
  return Array.from({ length: count }, (_, i) => {
    const date = addDays(end, i - (count - 1));
    return { id: date, date, createdAt: `${date}T00:00:00.000Z` };
  });
}

function outstandingRow(
  id: string,
  date: string,
  outstanding: number
): InvoiceOutstandingRow {
  return {
    invoiceId: id,
    contractId: "c",
    projectNo: "P",
    projectName: "Project",
    city: "Pune",
    number: id,
    date,
    dueDate: date,
    finalAmount: 1000,
    expected: 1000,
    paid: 0,
    outstanding,
    daysUntilDue: 0,
    status: outstandingIsStillDue(outstanding) ? "due" : "paid",
  };
}

function salesRow(id: string, date: string, net: number): SalesInvoiceRow {
  return {
    invoiceId: id,
    contractId: "c",
    projectNo: "P",
    projectName: "Project",
    city: "",
    number: id,
    date,
    net,
    gst: 0,
    other: 0,
    total: net,
  };
}

function collectionRow(
  id: string,
  date: string,
  net: number,
  gst: number,
  retention = 0,
  tds = 0,
  other = 0
): CollectionReportRow {
  return {
    paymentId: id,
    contractId: "c",
    invoiceId: null,
    projectNo: "P",
    projectName: "Project",
    city: "",
    date,
    against: "Unlinked",
    cashReceivedNet: net,
    cashReceivedGst: gst,
    cashReceived: net + gst,
    retention,
    tds,
    otherDeductions: other,
  };
}

test("proformas are the only oldest list", () => {
  assert.equal(LIST_WINDOW_ORDER.proformas, "oldest");
  for (const [name, order] of Object.entries(LIST_WINDOW_ORDER)) {
    if (name === "proformas") continue;
    assert.equal(order, "latest", name);
  }
});

test("a blank search, open dates, and type All are not filters", () => {
  assert.equal(listIsFiltered({}), false);
  assert.equal(
    listIsFiltered({ search: "  ", from: "", to: "", type: "ALL" }),
    false
  );
  assert.equal(listIsFiltered({ search: "pune" }), true);
  assert.equal(listIsFiltered({ from: TODAY }), true);
  assert.equal(listIsFiltered({ to: TODAY }), true);
  assert.equal(listIsFiltered({ type: "TI" }), true);
  assert.equal(listIsFiltered({ contract: "c1" }), true);
  assert.equal(listIsFiltered({ project: "p1" }), true);
  assert.equal(listIsFiltered({ showDeleted: true }), true);
  assert.equal(listIsFiltered({ dueWithin7: true }), true);
});

test("latest lists keep the newest 100 on or before today", () => {
  const past = span(150, TODAY);
  const future = [
    { id: "future-soon", date: addDays(TODAY, 1) },
    { id: "future-far", date: addDays(TODAY, 20) },
    { id: "blank", date: "" },
  ];
  const windowed = windowList([...future, ...past].reverse(), {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });

  assert.equal(windowed.capped, true);
  assert.equal(windowed.rows.length, LIST_WINDOW_LIMIT);
  assert.equal(windowed.rows[0]?.date, TODAY);
  assert.equal(windowed.rows[99]?.date, addDays(TODAY, -99));
  assert.equal(
    windowed.rows.some((row) => row.date > TODAY || row.date === ""),
    false
  );
  assert.equal(
    windowed.rows.some((row) => row.date === addDays(TODAY, -100)),
    false
  );
  assert.equal(listWindowNote(windowed.capped, "latest"), "Latest 100");
});

test("proformas keep the oldest 100 on or before today", () => {
  const past = span(150, TODAY);
  const future = { id: "future", date: addDays(TODAY, 5) };
  const windowed = windowList([future, ...past].reverse(), {
    filtered: false,
    order: "oldest",
    date: (row) => row.date,
    today: TODAY,
  });

  assert.equal(windowed.capped, true);
  assert.equal(windowed.rows.length, LIST_WINDOW_LIMIT);
  assert.equal(windowed.rows[0]?.date, addDays(TODAY, -149));
  assert.equal(windowed.rows[99]?.date, addDays(TODAY, -50));
  assert.equal(
    windowed.rows.some((row) => row.date > TODAY),
    false
  );
  assert.equal(listWindowNote(windowed.capped, "oldest"), "Oldest 100");
  assert.equal(listWindowNote(windowed.capped, "latest"), "Latest 100");
});

test("fewer than 100 qualifying rows are all shown and the note stays hidden", () => {
  const past = span(40, addDays(TODAY, -3));
  const future = { id: "future", date: addDays(TODAY, 1) };
  const windowed = windowList([...past, future], {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });

  assert.equal(windowed.capped, false);
  assert.equal(windowed.rows.length, 40);
  assert.equal(windowed.rows[0]?.date, past[past.length - 1]?.date);
  assert.equal(listWindowNote(windowed.capped, "latest"), null);
  assert.equal(listWindowNote(windowed.capped, "oldest"), null);

  const exact = windowList(span(100, TODAY), {
    filtered: false,
    order: "oldest",
    date: (row) => row.date,
    today: TODAY,
  });
  assert.equal(exact.capped, false);
  assert.equal(exact.rows.length, 100);
  assert.equal(exact.rows[0]?.date, addDays(TODAY, -99));
});

test("latest lists break a shared date by createdAt", () => {
  const rows = [
    { id: "earlier", date: TODAY, createdAt: "2026-10-22T01:00:00.000Z" },
    { id: "later", date: TODAY, createdAt: "2026-10-22T09:00:00.000Z" },
  ];
  const windowed = windowList(rows, {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    createdAt: (row) => row.createdAt,
    today: TODAY,
  });
  assert.deepEqual(
    windowed.rows.map((row) => row.id),
    ["later", "earlier"]
  );
});

test("a filter returns every match in the screen's existing order", () => {
  const past = span(150, TODAY);
  const rows = [{ id: "future", date: addDays(TODAY, 4) }, ...past];
  const windowed = windowList(rows, {
    filtered: true,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });

  assert.equal(windowed.capped, false);
  assert.equal(windowed.rows.length, 151);
  assert.deepEqual(
    windowed.rows.map((row) => row.id),
    rows.map((row) => row.id)
  );
  assert.equal(listWindowNote(windowed.capped, "latest"), null);
  assert.equal(listWindowNote(windowed.capped, "oldest"), null);
});

test("a newest cut can split the last challan", () => {
  const older = ["o1", "o2", "o3"].map((id) => ({
    id,
    date: "2026-01-01",
  }));
  const newer = ["n1", "n2", "n3"].map((id) => ({
    id,
    date: "2026-02-01",
  }));
  const windowed = windowList([...older, ...newer], {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
    limit: 4,
  });
  assert.deepEqual(
    windowed.rows.map((row) => row.id),
    ["n1", "n2", "n3", "o1"]
  );
});

test("open proforma count stays the full open count until a filter", () => {
  const open = span(150, TODAY);
  const windowed = windowList(open, {
    filtered: false,
    order: LIST_WINDOW_ORDER.proformas,
    date: (row) => row.date,
    today: TODAY,
  });
  assert.equal(windowed.rows.length, 100);
  assert.equal(wholeUntilFiltered(open.length, windowed.rows.length, false), 150);

  const matches = open.slice(0, 12);
  assert.equal(wholeUntilFiltered(open.length, matches.length, true), 12);
});

test("outstanding header stays the whole still-due figure until a filter", () => {
  const past = Array.from({ length: 150 }, (_, i) =>
    outstandingRow(`d${i}`, addDays(TODAY, i - 149), 201)
  );
  const future = outstandingRow("future", addDays(TODAY, 3), 500);
  const paidBand = outstandingRow("band", TODAY, 200);
  const extra = outstandingRow("extra", TODAY, -400);
  const all = [...past, future, paidBand, extra];
  const windowed = windowList(all, {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });

  assert.equal(outstandingIsStillDue(200), false);
  assert.equal(outstandingIsStillDue(200.01), true);
  assert.equal(outstandingIsStillDue(-400), false);
  assert.equal(sumOpenOutstanding([paidBand, extra]), 0);

  const whole = sumOpenOutstanding(all);
  assert.equal(whole, 150 * 201 + 500);
  assert.equal(windowed.rows.some((row) => row.invoiceId === "future"), false);
  assert.equal(sumOpenOutstanding(windowed.rows), 98 * 201);
  assert.equal(
    wholeUntilFiltered(whole, sumOpenOutstanding(windowed.rows), false),
    whole
  );

  const listed = [past[0]!];
  assert.equal(
    wholeUntilFiltered(whole, sumOpenOutstanding(listed), true),
    201
  );
});

test("sales net header stays the net of every tax invoice until a filter", () => {
  const past = Array.from({ length: 150 }, (_, i) =>
    salesRow(`s${i}`, addDays(TODAY, i - 149), 10)
  );
  const future = salesRow("future", addDays(TODAY, 2), 80);
  const all = [...past, future];
  const windowed = windowList(all, {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });
  const whole = sumSalesInvoiceNet(all);

  assert.equal(whole, 150 * 10 + 80);
  assert.equal(sumSalesInvoiceNet(windowed.rows), 100 * 10);
  assert.equal(
    wholeUntilFiltered(whole, sumSalesInvoiceNet(windowed.rows), false),
    whole
  );

  const listed = [salesRow("a", TODAY, 10), salesRow("b", TODAY, 25)];
  assert.equal(
    wholeUntilFiltered(whole, sumSalesInvoiceNet(listed), true),
    35
  );
});

test("collection header stays whole until a filter, and the export adds the rows on screen", () => {
  assert.equal(
    collectionCashReceived({
      netAmount: 100,
      gstAmount: 18,
      retentionAmount: 40,
      tdsAmount: 10,
      otherDeductions: 5,
      recovered: 25,
    } as Payment),
    118
  );

  const past = Array.from({ length: 150 }, (_, i) =>
    collectionRow(`p${i}`, addDays(TODAY, i - 149), 2, 1, 4, 5, 6)
  );
  const future = collectionRow("future", addDays(TODAY, 2), 10, 1, 9, 8, 7);
  const all = [...past, future];
  const windowed = windowList(all, {
    filtered: false,
    order: "latest",
    date: (row) => row.date,
    today: TODAY,
  });
  const whole = sumCollectionColumns(all);
  const onScreen = sumCollectionColumns(windowed.rows);

  assert.equal(whole.cashReceived, 150 * 3 + 11);
  assert.equal(whole.cashReceived, whole.cashReceivedNet + whole.cashReceivedGst);
  assert.equal(whole.retention, 150 * 4 + 9);
  assert.equal(whole.tds, 150 * 5 + 8);
  assert.equal(whole.otherDeductions, 150 * 6 + 7);
  assert.equal(onScreen.cashReceived, 100 * 3);
  assert.equal(onScreen.retention, 100 * 4);
  assert.equal(onScreen.tds, 100 * 5);
  assert.equal(onScreen.otherDeductions, 100 * 6);
  assert.notEqual(onScreen.cashReceived, whole.cashReceived);

  const header = wholeUntilFiltered(whole, onScreen, false);
  assert.equal(header.cashReceived, whole.cashReceived);
  assert.equal(header.retention, whole.retention);
  assert.equal(header.tds, whole.tds);
  assert.equal(header.otherDeductions, whole.otherDeductions);
  assert.equal(onScreen.cashReceived, 300);

  const listed = [past[0]!, past[1]!];
  const listedTotals = sumCollectionColumns(listed);
  const filteredHeader = wholeUntilFiltered(whole, listedTotals, true);
  assert.equal(filteredHeader.cashReceived, 6);
  assert.equal(filteredHeader.retention, 8);
  assert.equal(filteredHeader.tds, 10);
  assert.equal(filteredHeader.otherDeductions, 12);
  assert.deepEqual(sumCollectionColumns(listed), filteredHeader);
});
