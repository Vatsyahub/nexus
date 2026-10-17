import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoqItem,
  Contract,
  DeliveryChallan,
  FlowhubData,
  InstallationProgress,
  Invoice,
  InvoiceLine,
} from "@/lib/types";
import {
  EXECUTION_SUMMARY_EXPORT_HEADERS,
  buildExecutionSummaryRows,
  executionSummaryExportRow,
} from "@/lib/execution-reports";

function boq(id: string, name: string, quantity: number, unit = "Nos"): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase(),
    name,
    unit,
    rate: 10,
    quantity,
  };
}

function contract(id: string, projectNo: string, lines: BoqItem[]): Contract {
  return {
    id,
    projectNo,
    projectName: projectNo,
    boq: lines,
  } as Contract;
}

function challan(
  id: string,
  contractId: string,
  lines: { boqItemId: string; qty: number }[]
): DeliveryChallan {
  return {
    id,
    contractId,
    dcNo: id,
    date: "2026-10-01",
    lines,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdBy: null,
  };
}

function installed(
  contractId: string,
  boqItemId: string,
  installedQty: number
): InstallationProgress {
  return {
    id: `${contractId}-${boqItemId}`,
    contractId,
    boqItemId,
    installedQty,
    lastUpdatedAt: "2026-10-02",
    history: [],
  };
}

function invoiceLine(
  boqItemId: string,
  billedQty: number,
  termKey = "supply"
): InvoiceLine {
  return {
    boqItemId,
    itemName: boqItemId,
    termKey,
    billedQty,
    rate: 10,
    termPercent: 100,
    lineNet: 10 * billedQty,
  };
}

function invoice(opts: {
  id: string;
  type: "PI" | "TI";
  contractId: string;
  lines: InvoiceLine[];
}): Invoice {
  return {
    id: opts.id,
    type: opts.type,
    number: opts.id,
    date: "2026-10-03",
    contractId: opts.contractId,
    lines: opts.lines,
    netAmount: 0,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 0,
    convertedFromPiId: null,
    createdAt: "2026-10-03T00:00:00.000Z",
  };
}

function workspace(opts: {
  contracts: Contract[];
  deliveryChallans?: DeliveryChallan[];
  installationProgress?: InstallationProgress[];
  invoices?: Invoice[];
}): FlowhubData {
  return {
    contracts: opts.contracts,
    deliveryChallans: opts.deliveryChallans ?? [],
    installationProgress: opts.installationProgress ?? [],
    invoices: opts.invoices ?? [],
  } as FlowhubData;
}

test("unbilled qty uses only the matching tax-invoice term and floors at zero", () => {
  const data = workspace({
    contracts: [
      contract("c1", "P-1", [boq("panel", "Panel", 20), boq("cable", "Cable", 8)]),
      contract("c2", "P-2", [boq("panel-b", "Panel", 5)]),
    ],
    deliveryChallans: [
      challan("dc1", "c1", [
        { boqItemId: "panel", qty: 6 },
        { boqItemId: "panel", qty: 4 },
        { boqItemId: "cable", qty: 3 },
      ]),
      challan("dc2", "c2", [{ boqItemId: "panel-b", qty: 5 }]),
    ],
    installationProgress: [
      installed("c1", "panel", 7),
      installed("c1", "cable", 1),
      installed("c2", "panel-b", 2),
    ],
    invoices: [
      invoice({
        id: "ti-supply",
        type: "TI",
        contractId: "c1",
        lines: [
          invoiceLine("panel", 3, "supply"),
          invoiceLine("panel", 2, "installation"),
          invoiceLine("panel", 8, "advance"),
          invoiceLine("panel", 7, "gad"),
          invoiceLine("panel", 6, "testing"),
          invoiceLine("panel", 5, "handover"),
          invoiceLine("panel", 4, "stage_payment"),
          invoiceLine("cable", 9, "supply"),
          invoiceLine("cable", 4, "installation"),
          invoiceLine("other", 50, "supply"),
        ],
      }),
      invoice({
        id: "ti-more",
        type: "TI",
        contractId: "c1",
        lines: [invoiceLine("panel", 1, "supply")],
      }),
      invoice({
        id: "pi",
        type: "PI",
        contractId: "c1",
        lines: [invoiceLine("panel", 100, "supply"), invoiceLine("cable", 100)],
      }),
      invoice({
        id: "ti-other-contract",
        type: "TI",
        contractId: "c2",
        lines: [invoiceLine("panel", 4, "supply")],
      }),
      invoice({
        id: "ti-credit",
        type: "TI",
        contractId: "c2",
        lines: [invoiceLine("panel-b", -1, "supply")],
      }),
    ],
  });

  const rows = buildExecutionSummaryRows(data);
  const panel = rows.find((r) => r.boqItemId === "panel");
  const cable = rows.find((r) => r.boqItemId === "cable");
  const other = rows.find((r) => r.boqItemId === "panel-b");
  assert.ok(panel);
  assert.ok(cable);
  assert.ok(other);

  assert.equal(panel.boqQty, 20);
  assert.equal(panel.supplied, 10);
  assert.equal(panel.installed, 7);
  assert.equal(panel.leftToSupply, 10);
  assert.equal(panel.leftToInstall, 3);
  assert.equal(panel.unbilledSupplyQty, 10 - (3 + 1));
  assert.equal(panel.unbilledInstallQty, 7 - 2);

  assert.equal(cable.supplied, 3);
  assert.equal(cable.installed, 1);
  assert.equal(cable.leftToSupply, 5);
  assert.equal(cable.leftToInstall, 2);
  assert.equal(cable.unbilledSupplyQty, 0);
  assert.equal(cable.unbilledInstallQty, 0);

  assert.equal(other.supplied, 5);
  assert.equal(other.installed, 2);
  assert.equal(other.unbilledSupplyQty, 6);
  assert.equal(other.unbilledInstallQty, 2);

  assert.deepEqual(EXECUTION_SUMMARY_EXPORT_HEADERS.slice(-2), [
    "Unbilled Supply Qty",
    "Unbilled Install Qty",
  ]);
  assert.equal(
    EXECUTION_SUMMARY_EXPORT_HEADERS.indexOf("Left for installation"),
    EXECUTION_SUMMARY_EXPORT_HEADERS.length - 3
  );
  assert.equal(
    EXECUTION_SUMMARY_EXPORT_HEADERS.some((h) => h.includes("\n")),
    false
  );
  const exported = executionSummaryExportRow(panel);
  assert.deepEqual(exported, [
    "P-1",
    "P-1",
    "Panel",
    "Nos",
    20,
    10,
    7,
    10,
    3,
    6,
    5,
  ]);
});

test("a BOQ line with no tax invoice stays fully unbilled", () => {
  const data = workspace({
    contracts: [contract("c1", "P-9", [boq("beam", "Beam", 4, "m")])],
    deliveryChallans: [challan("dc", "c1", [{ boqItemId: "beam", qty: 2.5 }])],
    installationProgress: [installed("c1", "beam", 0)],
    invoices: [
      invoice({
        id: "pi-only",
        type: "PI",
        contractId: "c1",
        lines: [invoiceLine("beam", 2.5)],
      }),
    ],
  });
  const [row] = buildExecutionSummaryRows(data);
  assert.equal(row.supplied, 2.5);
  assert.equal(row.installed, 0);
  assert.equal(row.leftToSupply, 1.5);
  assert.equal(row.leftToInstall, 2.5);
  assert.equal(row.unbilledSupplyQty, 2.5);
  assert.equal(row.unbilledInstallQty, 0);
});
