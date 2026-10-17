import assert from "node:assert/strict";
import test from "node:test";
import type { Contract, FlowhubData, Invoice, Payment, ScheduleLine } from "@/lib/types";
import { contractDisplayStatus } from "@/lib/nexus-core";
import {
  buildInvoiceOutstandingRows,
  buildSalesContractRows,
  invoiceNetOutstanding,
} from "@/lib/reports";
import { invoiceOutstanding, suppliedQty } from "@/lib/store";

/**
 * One contract with thousands of tax invoices used to rebuild the unlinked
 * FIFO from scratch for every row (invoices × invoices × payments). These
 * counts finish well under a second once each snapshot is indexed once.
 */
const FILLERS = 1500;
const OTHERS = 400;

function contract(id: string): Contract {
  return {
    id,
    projectNo: id,
    projectName: id,
    city: "Pune",
    orderValue: 1_000_000,
    retentionPercent: 0,
    tdsPercent: 0,
    paymentDueDays: 0,
    status: "active",
  } as Contract;
}

function ti(
  id: string,
  contractId: string,
  net: number,
  date: string,
  createdAt: string
): Invoice {
  return {
    id,
    type: "TI",
    number: id,
    date,
    contractId,
    lines: [],
    netAmount: net,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: net,
    convertedFromPiId: null,
    createdAt,
  };
}

test("large ledgers keep FIFO outstanding and finish in one pass", () => {
  const contracts: Contract[] = [contract("main")];
  const invoices: Invoice[] = [
    ti("ti-a", "main", 100, "2020-01-01", "2020-01-01T00:00:00.000Z"),
    ti("ti-b", "main", 100, "2020-01-02", "2020-01-02T00:00:00.000Z"),
  ];
  const payments: Payment[] = [
    {
      id: "unlinked",
      contractId: "main",
      invoiceId: null,
      link: "unlinked",
      date: "2020-01-15",
      netAmount: 150,
      gstAmount: 0,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: "2020-01-15T00:00:00.000Z",
    },
  ];

  for (let i = 0; i < FILLERS; i += 1) {
    const createdAt = new Date(Date.UTC(2021, 0, 1) + i * 1000).toISOString();
    invoices.push(ti(`ti-f-${i}`, "main", 100, "2021-06-01", createdAt));
  }

  for (let i = 0; i < OTHERS; i += 1) {
    const id = `c-${i}`;
    contracts.push(contract(id));
    invoices.push(
      ti(id, id, 80, "2022-01-01", "2022-01-01T00:00:00.000Z")
    );
    payments.push({
      id: `pay-${i}`,
      contractId: id,
      invoiceId: id,
      link: "TI",
      date: "2022-02-01",
      netAmount: 30,
      gstAmount: 0,
      retentionAmount: 0,
      tdsAmount: 0,
      otherDeductions: 0,
      otherDeductionReason: "",
      recovered: 0,
      createdAt: "2022-02-01T00:00:00.000Z",
    });
  }

  const schedules: ScheduleLine[] = contracts.map((c, i) => ({
    id: `h-${c.id}`,
    contractId: c.id,
    kind: "handover",
    boqItemId: null,
    quantity: null,
    startDate: i === 0 ? "2020-01-01" : "2099-01-01",
    endDate: null,
    done: false,
    committed: true,
    createdAt: "2020-01-01T00:00:00.000Z",
  })) as unknown as ScheduleLine[];

  const data = {
    contracts,
    invoices,
    payments,
    schedules,
    tasks: [],
    deliveryChallans: [
      {
        id: "dc",
        contractId: "main",
        dcNo: "DC-1",
        date: "2022-03-01",
        lines: [
          { boqItemId: "panel", qty: 4 },
          { boqItemId: "panel", qty: 6 },
        ],
        createdAt: "2022-03-01T00:00:00.000Z",
        createdBy: null,
      },
    ],
    installationProgress: [],
  } as unknown as FlowhubData;

  const started = performance.now();
  const rows = buildInvoiceOutstandingRows(data);
  const sales = buildSalesContractRows(data);
  let homeDue = 0;
  for (const invoice of data.invoices) {
    if (invoice.type !== "TI") continue;
    const due = invoiceOutstanding(invoice, data);
    if (due >= 100) homeDue += due;
  }
  const elapsed = performance.now() - started;

  const byId = new Map(rows.map((row) => [row.invoiceId, row]));
  assert.equal(byId.get("ti-a")?.outstanding, 0);
  assert.equal(byId.get("ti-b")?.outstanding, 50);
  assert.equal(byId.get("ti-f-0")?.outstanding, 100);
  assert.equal(byId.get("c-0")?.outstanding, 50);
  assert.equal(invoiceNetOutstanding(invoices[0], data), 0);
  assert.equal(invoiceNetOutstanding(invoices[1], data), 50);
  const mainSales = sales.find((row) => row.contractId === "main");
  assert.ok(mainSales);
  assert.equal(mainSales.totalOutstanding, 100 * FILLERS + 50);
  assert.equal(suppliedQty("main", "panel", data), 10);
  assert.equal(contractDisplayStatus(data, contracts[0], "2026-10-17"), "Completed");
  assert.equal(contractDisplayStatus(data, contracts[1], "2026-10-17"), "Active");
  assert.ok(
    elapsed < 1500,
    `large ledger took ${elapsed.toFixed(0)}ms`
  );
  assert.ok(homeDue > 0);

  const again = performance.now();
  buildInvoiceOutstandingRows(data);
  buildSalesContractRows(data);
  const second = performance.now() - again;
  assert.ok(second < 800, `cached ledger took ${second.toFixed(0)}ms`);
});
