import assert from "node:assert/strict";
import test from "node:test";
import type { BoqItem, Contract, FlowhubData, Invoice } from "@/lib/types";
import { todayIso } from "@/lib/nexus-core";
import {
  buildExecutionSummaryRows,
  filterExecutionSummaryRows,
} from "@/lib/execution-reports";
import {
  buildReconciliationSummary,
  buildSalesContractRows,
  buildSalesInvoiceRows,
  filterSalesContractRows,
  filterSalesInvoiceRows,
} from "@/lib/reports";

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function boq(id: string): BoqItem {
  return {
    id,
    catalogKey: id,
    name: "Panel",
    unit: "Nos",
    rate: 1,
    quantity: 1,
  };
}

function contract(
  partial: Pick<Contract, "id" | "projectNo" | "projectName" | "status"> &
    Partial<Contract>
): Contract {
  return {
    city: "",
    state: "",
    orderValue: 0,
    handoverDate: null,
    boq: [boq(partial.id)],
    ...partial,
  } as Contract;
}

function ids(rows: { contractId: string }[]): string[] {
  return [...new Set(rows.map((row) => row.contractId))].sort();
}

test("typed status matches the on-screen project status", () => {
  const today = todayIso();
  assert.equal(isoOffset(0), today);

  const active = contract({
    id: "active",
    projectNo: "P-A",
    projectName: "Alpha yard",
    city: "Pune",
    status: "active",
    handoverDate: null,
  });
  const onHold = contract({
    id: "hold",
    projectNo: "P-H",
    projectName: "Paused site",
    city: "Delhi",
    status: "on_hold",
    handoverDate: isoOffset(30),
  });
  const completed = contract({
    id: "done",
    projectNo: "P-C",
    projectName: "River bridge",
    city: "Jaipur",
    status: "active",
    handoverDate: today,
  });
  const storedCompleted = contract({
    id: "stored",
    projectNo: "P-S",
    projectName: "Legacy file",
    city: "Kochi",
    status: "completed",
    handoverDate: null,
  });

  const data = {
    contracts: [active, onHold, completed, storedCompleted],
    invoices: [
      {
        id: "ti-9",
        type: "TI",
        number: "TI-9",
        contractId: completed.id,
        date: "2026-01-15",
        netAmount: 100,
        gstAmount: 0,
        finalAmount: 100,
        createdAt: "2026-01-15T00:00:00.000Z",
      } as Invoice,
    ],
    payments: [],
    deliveryChallans: [],
    installationProgress: [],
  } as unknown as FlowhubData;

  const all = ["active", "done", "hold", "stored"];
  const sales = buildSalesContractRows(data);
  const summary = buildExecutionSummaryRows(data);
  const searches = [
    (query: string) => filterSalesContractRows(sales, query),
    (query: string) => buildReconciliationSummary(data, { q: query }),
    (query: string) => filterExecutionSummaryRows(summary, query),
  ];

  for (const search of searches) {
    assert.deepEqual(ids(search("")), all);
    assert.deepEqual(ids(search("Active")), ["active", "stored"]);
    assert.deepEqual(ids(search("ACTIVE")), ["active", "stored"]);
    assert.deepEqual(ids(search("On hold")), ["hold"]);
    assert.deepEqual(ids(search("Completed")), ["done"]);
    assert.deepEqual(ids(search("completed")), ["done"]);
    assert.equal(ids(search("Completed")).includes("stored"), false);
    assert.equal(ids(search("Active")).includes("stored"), true);
  }

  const invoices = buildSalesInvoiceRows(data);
  assert.deepEqual(filterSalesInvoiceRows(invoices, { q: "Active" }), []);
  assert.deepEqual(filterSalesInvoiceRows(invoices, { q: "On hold" }), []);
  assert.deepEqual(filterSalesInvoiceRows(invoices, { q: "Completed" }), []);
  assert.deepEqual(
    filterSalesInvoiceRows(invoices, { q: "TI-9" }).map((row) => row.invoiceId),
    ["ti-9"]
  );
});
