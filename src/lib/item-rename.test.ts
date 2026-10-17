import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExecutionSummaryRows,
  buildItemListRows,
} from "@/lib/execution-reports";
import {
  currentItemUnits,
  itemNameChoices,
  keepInUseItemNames,
  renameItemRecords,
} from "@/lib/item-rename";
import type {
  BoqAmendment,
  BoqItem,
  Contract,
  DeliveryChallan,
  FlowhubData,
  InstallationProgress,
  Invoice,
  ScheduleLine,
} from "@/lib/types";

function line(
  id: string,
  name: string,
  quantity: number,
  rate = 10,
  unit = "Nos"
): BoqItem {
  return {
    id,
    catalogKey: name.trim().toLowerCase(),
    name,
    unit,
    rate,
    quantity,
  };
}

function contract(partial: Partial<Contract> & { id: string }): Contract {
  return {
    projectNo: partial.id,
    projectName: partial.id,
    city: "Mumbai",
    status: "active",
    boq: [],
    amendments: [],
    ...partial,
  } as Contract;
}

function invoice(partial: Partial<Invoice> & { id: string }): Invoice {
  return {
    type: "TI",
    number: partial.id,
    date: "2026-10-01",
    contractId: "c1",
    lines: [],
    netAmount: 0,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 0,
    convertedFromPiId: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

function workspace(partial: Partial<FlowhubData>): FlowhubData {
  return {
    contracts: [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    notifications: [],
    customDepartments: [],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    ...partial,
  } as FlowhubData;
}

function amendment(): BoqAmendment {
  return {
    id: "a1",
    seq: 1,
    number: "A1",
    date: "2026-09-01",
    at: "2026-09-01T00:00:00.000Z",
    by: "Ada",
    note: "Raised qty",
    previousOrderValue: 10,
    newOrderValue: 20,
    previousBoqTotal: 10,
    newBoqTotal: 20,
    lineDiffs: [
      {
        boqItemId: "b1",
        name: "Panel",
        unit: "Nos",
        rate: 10,
        kind: "qty_changed",
        previousQty: 1,
        newQty: 2,
      },
      {
        boqItemId: "gone",
        name: "Old hoist",
        unit: "Nos",
        rate: 4,
        kind: "removed",
        previousQty: 1,
        newQty: null,
      },
    ],
    boqSnapshot: [line("b1", "Panel", 2)],
  };
}

function hub(): FlowhubData {
  const challan: DeliveryChallan = {
    id: "dc1",
    contractId: "c1",
    dcNo: "DC-1",
    date: "2026-10-02",
    lines: [{ boqItemId: "b1", qty: 1 }],
    createdAt: "2026-10-02T00:00:00.000Z",
    createdBy: "Ada",
  };
  const schedule: ScheduleLine = {
    id: "s1",
    contractId: "c1",
    boqItemId: "b1",
    kind: "supply",
    quantity: 2,
    startDate: "2026-10-03",
    endDate: "2026-10-04",
    committed: true,
    baselineStartDate: "2026-10-03",
    baselineEndDate: "2026-10-04",
    done: false,
    doneAt: null,
    doneBy: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const install: InstallationProgress = {
    id: "i1",
    contractId: "c1",
    boqItemId: "b1",
    installedQty: 1,
    lastUpdatedAt: "2026-10-05",
    history: [],
  };
  return workspace({
    contracts: [
      contract({
        id: "c1",
        city: "Mumbai",
        boq: [line("b1", "Panel", 2, 10, "Nos"), line("b2", "Cable", 4, 3, "m")],
        amendments: [amendment()],
      }),
      contract({
        id: "c2",
        city: "Delhi",
        status: "on_hold",
        boq: [line("b3", "panel", 5, 10, "Nos")],
      }),
      contract({
        id: "c3",
        city: "Pune",
        boq: [line("b4", "Loose cable", 1, 8, "m")],
      }),
    ],
    itemCatalog: [
      { key: "panel", name: "Panel", unit: "Nos", lastRate: 10 },
      { key: "cable", name: "Cable", unit: "m", lastRate: 3 },
      { key: "old hoist", name: "Old hoist", unit: "Nos", lastRate: 4 },
      { key: "scrap", name: "Scrap", unit: "Nos", lastRate: 1 },
    ],
    invoices: [
      invoice({
        id: "inv1",
        contractId: "c1",
        lines: [
          {
            boqItemId: "b1",
            itemName: "Panel",
            termKey: "supply",
            billedQty: 1,
            rate: 10,
            termPercent: 100,
            lineNet: 10,
          },
          {
            boqItemId: "b2",
            itemName: "Cable",
            termKey: "supply",
            billedQty: 2,
            rate: 3,
            termPercent: 50,
            lineNet: 3,
          },
        ],
      }),
      invoice({
        id: "inv-old",
        contractId: "c-old",
        lines: [
          {
            boqItemId: "removed-panel",
            itemName: "Panel",
            termKey: "supply",
            billedQty: 1,
            rate: 10,
            termPercent: 100,
            lineNet: 10,
          },
        ],
      }),
    ],
    deliveryChallans: [challan],
    schedules: [schedule],
    installationProgress: [install],
  });
}

test("rename updates the current item everywhere and keeps one catalog row", () => {
  const data = hub();
  const result = renameItemRecords(data, " panel ", "Control panel");
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const next = result.data;
  const mumbai = next.contracts.find((c) => c.id === "c1")!;
  const held = next.contracts.find((c) => c.id === "c2")!;
  const panel = mumbai.boq.find((b) => b.id === "b1")!;
  const cable = mumbai.boq.find((b) => b.id === "b2")!;
  assert.equal(panel.name, "Control panel");
  assert.equal(panel.catalogKey, "control panel");
  assert.equal(panel.unit, "Nos");
  assert.equal(panel.rate, 10);
  assert.equal(panel.quantity, 2);
  assert.equal(held.boq[0]?.name, "Control panel");
  assert.equal(held.boq[0]?.quantity, 5);
  assert.equal(cable.name, "Cable");
  assert.equal(cable.rate, 3);
  assert.equal(cable.quantity, 4);

  const currentInvoice = next.invoices.find((i) => i.id === "inv1")!;
  const panelLine = currentInvoice.lines[0]!;
  const cableLine = currentInvoice.lines[1]!;
  assert.equal(panelLine.itemName, "Control panel");
  assert.equal(panelLine.billedQty, 1);
  assert.equal(panelLine.rate, 10);
  assert.equal(panelLine.termPercent, 100);
  assert.equal(panelLine.lineNet, 10);
  assert.equal(cableLine.itemName, "Cable");
  assert.equal(next.invoices.find((i) => i.id === "inv-old")?.lines[0]?.itemName, "Control panel");

  assert.equal(next.itemCatalog.filter((e) => e.key === "panel").length, 0);
  const catalog = next.itemCatalog.find((e) => e.key === "control panel");
  assert.ok(catalog);
  assert.equal(catalog.name, "Control panel");
  assert.equal(catalog.unit, "Nos");
  assert.equal(catalog.lastRate, 10);
  assert.equal(
    next.itemCatalog.filter((e) => e.name.toLowerCase().includes("panel")).length,
    1
  );

  assert.equal(mumbai.amendments, data.contracts[0]?.amendments);
  assert.equal(mumbai.amendments[0]?.lineDiffs[0]?.name, "Panel");
  assert.equal(mumbai.amendments[0]?.lineDiffs[1]?.name, "Old hoist");
  assert.equal(mumbai.amendments[0]?.boqSnapshot[0]?.name, "Panel");
  assert.equal(mumbai.amendments[0]?.boqSnapshot[0]?.catalogKey, "panel");

  assert.equal(next.deliveryChallans, data.deliveryChallans);
  assert.equal(next.deliveryChallans[0]?.lines[0]?.qty, 1);
  assert.equal(next.schedules, data.schedules);
  assert.equal(next.schedules[0]?.quantity, 2);
  assert.equal(next.installationProgress, data.installationProgress);
  assert.equal(next.installationProgress[0]?.installedQty, 1);

  assert.deepEqual(
    buildItemListRows(next).map((row) => row.itemName),
    ["Cable", "Control panel", "Loose cable"]
  );
  assert.equal(
    buildExecutionSummaryRows(next).find((row) => row.boqItemId === "b1")?.itemName,
    "Control panel"
  );
  assert.equal(data.contracts[0]?.boq[0]?.name, "Panel");

  const choices = itemNameChoices(next).map((choice) => choice.name);
  assert.deepEqual(choices, ["Cable", "Control panel", "Loose cable"]);
  assert.equal(choices.includes("Panel"), false);
  assert.equal(choices.includes("Old hoist"), false);
  assert.equal(choices.includes("Scrap"), false);
});

test("the picker offers current hub names only", () => {
  const names = itemNameChoices(hub()).map((choice) => choice.name);
  assert.deepEqual(names, ["Cable", "Loose cable", "Panel"]);
  assert.equal(names.includes("Old hoist"), false);
  assert.equal(names.includes("Scrap"), false);
});

test("renaming onto an existing name keeps that item and folds same rates", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c1",
        city: "Mumbai",
        boq: [
          line("panel", "Panel", 2, 10, "Nos"),
          line("cable-same", "Cable", 3, 10, "m"),
          line("cable-other", "Cable", 4, 25, "Set"),
        ],
        amendments: [
          {
            ...amendment(),
            boqSnapshot: [{ ...line("panel", "Panel", 2, 10, "Nos"), unit: "Nos" }],
          },
        ],
      }),
    ],
    itemCatalog: [
      { key: "panel", name: "Panel", unit: "Nos", lastRate: 10 },
      { key: "cable", name: "Cable", unit: "m", lastRate: 8 },
    ],
    invoices: [
      invoice({
        id: "inv-panel",
        lines: [
          {
            boqItemId: "panel",
            itemName: "Panel",
            termKey: "supply",
            billedQty: 1,
            rate: 10,
            termPercent: 100,
            lineNet: 10,
          },
        ],
      }),
      invoice({
        id: "inv-cable",
        lines: [
          {
            boqItemId: "cable-other",
            itemName: "Cable",
            termKey: "supply",
            billedQty: 4,
            rate: 25,
            termPercent: 100,
            lineNet: 100,
          },
        ],
      }),
    ],
    deliveryChallans: [
      {
        id: "dc1",
        contractId: "c1",
        dcNo: "DC-1",
        date: "2026-10-02",
        lines: [
          { boqItemId: "panel", qty: 1 },
          { boqItemId: "cable-same", qty: 2 },
        ],
        createdAt: "2026-10-02T00:00:00.000Z",
        createdBy: "Ada",
      },
    ],
    installationProgress: [
      {
        id: "inst-panel",
        contractId: "c1",
        boqItemId: "panel",
        installedQty: 1,
        lastUpdatedAt: "2026-10-03",
        history: [],
      },
      {
        id: "inst-cable",
        contractId: "c1",
        boqItemId: "cable-same",
        installedQty: 2,
        lastUpdatedAt: "2026-10-04",
        history: [],
      },
    ],
    schedules: [
      {
        id: "s1",
        contractId: "c1",
        boqItemId: "panel",
        kind: "supply",
        quantity: 2,
        startDate: "2026-10-03",
        endDate: "2026-10-04",
        committed: true,
        baselineStartDate: "2026-10-03",
        baselineEndDate: "2026-10-04",
        done: false,
        doneAt: null,
        doneBy: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ],
    nexusCosts: {
      columns: [{ id: "labour", header: "Labour" }],
      contracts: {
        c1: {
          directCost: null,
          lineRates: {
            panel: { labour: 1 },
            "cable-same": { labour: 5 },
          },
        },
      },
    },
  });

  const result = renameItemRecords(data, "Panel", "cable");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const boq = result.data.contracts[0]?.boq ?? [];
  assert.equal(boq.length, 2);
  const same = boq.find((row) => row.id === "cable-same");
  const other = boq.find((row) => row.id === "cable-other");
  assert.ok(same);
  assert.ok(other);
  assert.equal(boq.some((row) => row.id === "panel"), false);
  assert.equal(same.name, "Cable");
  assert.equal(same.quantity, 5);
  assert.equal(same.rate, 10);
  assert.equal(same.unit, "m");
  assert.equal(other.name, "Cable");
  assert.equal(other.quantity, 4);
  assert.equal(other.rate, 25);
  assert.equal(other.unit, "m");

  const folded = result.data.invoices.find((row) => row.id === "inv-panel")?.lines[0];
  assert.equal(folded?.boqItemId, "cable-same");
  assert.equal(folded?.itemName, "Cable");
  assert.equal(folded?.billedQty, 1);
  assert.equal(folded?.rate, 10);
  assert.equal(folded?.lineNet, 10);
  const keptInvoice = result.data.invoices.find((row) => row.id === "inv-cable")?.lines[0];
  assert.equal(keptInvoice?.boqItemId, "cable-other");
  assert.equal(keptInvoice?.rate, 25);

  assert.deepEqual(result.data.deliveryChallans[0]?.lines, [
    { boqItemId: "cable-same", qty: 3 },
  ]);
  assert.equal(result.data.installationProgress.length, 1);
  assert.equal(result.data.installationProgress[0]?.id, "inst-cable");
  assert.equal(result.data.installationProgress[0]?.boqItemId, "cable-same");
  assert.equal(result.data.installationProgress[0]?.installedQty, 3);
  assert.equal(result.data.schedules[0]?.boqItemId, "cable-same");
  assert.equal(result.data.schedules[0]?.quantity, 2);
  assert.equal(result.data.nexusCosts?.contracts.c1?.lineRates.panel, undefined);
  assert.equal(result.data.nexusCosts?.contracts.c1?.lineRates["cable-same"]?.labour, 5);

  const catalog = result.data.itemCatalog.filter((entry) =>
    entry.name.toLowerCase().includes("cable") || entry.name.toLowerCase().includes("panel")
  );
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]?.key, "cable");
  assert.equal(catalog[0]?.name, "Cable");
  assert.equal(catalog[0]?.unit, "m");
  assert.equal(catalog[0]?.lastRate, 8);

  const rows = buildItemListRows(result.data);
  const cable = rows.find((row) => row.itemName === "Cable");
  assert.equal(rows.filter((row) => row.key === "cable").length, 1);
  assert.equal(cable?.totalQty, 9);

  const choice = itemNameChoices(result.data).find((row) => row.key === "cable");
  assert.equal(choice?.name, "Cable");
  assert.equal(choice?.unit, "m");
  assert.equal(choice?.lastRate, 8);
  assert.equal(
    itemNameChoices(result.data).some((row) => row.name === "Panel"),
    false
  );
  assert.equal(result.data.contracts[0]?.amendments[0]?.boqSnapshot[0]?.name, "Panel");
  assert.equal(result.data.contracts[0]?.amendments[0]?.lineDiffs[0]?.name, "Panel");
  assert.equal(data.contracts[0]?.boq[0]?.name, "Panel");
});

test("a unit Master types while combining replaces the surviving unit", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c1",
        boq: [
          line("panel", "Panel", 2, 10, "Nos"),
          line("cable", "Cable", 3, 10, "m"),
        ],
      }),
    ],
    itemCatalog: [
      { key: "panel", name: "Panel", unit: "Nos", lastRate: 10 },
      { key: "cable", name: "Cable", unit: "m", lastRate: 8 },
    ],
  });
  const result = renameItemRecords(data, "Panel", "Cable", "Set");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.contracts[0]?.boq.length, 1);
  assert.equal(result.data.contracts[0]?.boq[0]?.id, "cable");
  assert.equal(result.data.contracts[0]?.boq[0]?.quantity, 5);
  assert.equal(result.data.contracts[0]?.boq[0]?.unit, "Set");
  assert.equal(result.data.itemCatalog.find((entry) => entry.key === "cable")?.unit, "Set");
});

test("editing the unit updates current lines and leaves amendment history", () => {
  const data = hub();
  const result = renameItemRecords(data, "Panel", "Panel", "Set");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.contracts[0]?.boq[0]?.name, "Panel");
  assert.equal(result.data.contracts[0]?.boq[0]?.unit, "Set");
  assert.equal(result.data.contracts[0]?.boq[0]?.rate, 10);
  assert.equal(result.data.contracts[0]?.boq[0]?.quantity, 2);
  assert.equal(result.data.contracts[1]?.boq[0]?.unit, "Set");
  assert.equal(result.data.contracts[0]?.boq[1]?.unit, "m");
  assert.equal(result.data.itemCatalog.find((entry) => entry.key === "panel")?.unit, "Set");
  assert.equal(result.data.itemCatalog.find((entry) => entry.key === "panel")?.lastRate, 10);
  assert.equal(result.data.contracts[0]?.amendments[0]?.boqSnapshot[0]?.unit, "Nos");
  assert.equal(result.data.contracts[0]?.amendments[0]?.lineDiffs[0]?.unit, "Nos");
  assert.equal(result.data.invoices[0]?.lines[0]?.itemName, "Panel");
  assert.equal(result.data.invoices[0]?.lines[0]?.rate, 10);
});

test("a rename to a new name leaves each line's unit until Master changes it", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c1",
        boq: [
          line("a", "Panel", 2, 10, "Nos"),
          line("b", "Panel", 1, 12, "Set"),
        ],
      }),
    ],
    itemCatalog: [{ key: "panel", name: "Panel", unit: "Nos", lastRate: 10 }],
  });
  const renamed = renameItemRecords(data, "Panel", "Control panel");
  assert.equal(renamed.ok, true);
  if (!renamed.ok) return;
  assert.equal(renamed.data.contracts[0]?.boq.length, 2);
  assert.equal(renamed.data.contracts[0]?.boq[0]?.name, "Control panel");
  assert.equal(renamed.data.contracts[0]?.boq[0]?.unit, "Nos");
  assert.equal(renamed.data.contracts[0]?.boq[0]?.quantity, 2);
  assert.equal(renamed.data.contracts[0]?.boq[1]?.unit, "Set");
  assert.equal(renamed.data.contracts[0]?.boq[1]?.rate, 12);
  assert.equal(renamed.data.itemCatalog[0]?.unit, "Nos");

  const edited = renameItemRecords(data, "Panel", "Control panel", "Lot");
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.data.contracts[0]?.boq[0]?.unit, "Lot");
  assert.equal(edited.data.contracts[0]?.boq[1]?.unit, "Lot");
  assert.equal(edited.data.contracts[0]?.boq[0]?.quantity, 2);
  assert.equal(edited.data.contracts[0]?.boq[1]?.quantity, 1);
  assert.equal(edited.data.itemCatalog[0]?.name, "Control panel");
  assert.equal(edited.data.itemCatalog[0]?.unit, "Lot");
});

test("the item list units are the distinct units on current lines", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c1",
        boq: [
          line("a", "Panel", 2, 10, "Nos"),
          line("b", "Panel", 1, 12, "Nos"),
        ],
      }),
      contract({
        id: "c2",
        boq: [line("c", "Panel", 4, 10, "Set")],
      }),
      contract({
        id: "c3",
        boq: [
          line("d", "Cable", 1, 3, "m"),
          line("e", "Cable", 1, 8, "Roll"),
          line("f", "Cable", 1, 9, "Lot"),
        ],
      }),
    ],
  });
  const units = currentItemUnits(data);
  assert.deepEqual(units.get("panel"), ["Nos", "Set"]);
  assert.deepEqual(units.get("cable"), ["m", "Roll", "Lot"]);
});

test("saving one unit replaces every current unit of that item", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c1",
        boq: [
          line("a", "Panel", 2, 10, "Nos"),
          line("b", "Panel", 3, 25, "Set"),
        ],
      }),
      contract({
        id: "c2",
        boq: [line("c", "Panel", 4, 10, "Lot")],
      }),
    ],
    itemCatalog: [{ key: "panel", name: "Panel", unit: "Nos", lastRate: 10 }],
  });
  const result = renameItemRecords(data, "Panel", "Panel", "Nos");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.contracts[0]?.boq.length, 2);
  assert.equal(result.data.contracts[0]?.boq[0]?.quantity, 2);
  assert.equal(result.data.contracts[0]?.boq[1]?.quantity, 3);
  assert.equal(result.data.contracts[0]?.boq[1]?.rate, 25);
  assert.deepEqual(
    result.data.contracts.flatMap((contract) => contract.boq.map((row) => row.unit)),
    ["Nos", "Nos", "Nos"]
  );
  assert.deepEqual(currentItemUnits(result.data).get("panel"), ["Nos"]);
  assert.equal(result.data.itemCatalog[0]?.unit, "Nos");
  const rows = buildItemListRows(result.data);
  assert.equal(rows.filter((row) => row.key === "panel").length, 1);
  assert.equal(rows.find((row) => row.key === "panel")?.totalQty, 9);
});

test("a case change keeps the same catalog key and updates the spelling", () => {
  const data = hub();
  const result = renameItemRecords(data, "panel", "PANEL");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.contracts[0]?.boq[0]?.name, "PANEL");
  assert.equal(result.data.contracts[0]?.boq[0]?.catalogKey, "panel");
  assert.equal(result.data.itemCatalog.find((e) => e.key === "panel")?.name, "PANEL");
  assert.equal(result.data.itemCatalog.some((e) => e.key === "PANEL"), false);
  assert.equal(result.data.contracts[0]?.amendments[0]?.boqSnapshot[0]?.name, "Panel");
});

test("a refused rename of an invoiced item leaves the old name as the only choice", () => {
  const current = workspace({
    contracts: [
      contract({
        id: "c1",
        boq: [line("b1", "Panel", 2), line("b2", "Washer", 1, 1)],
      }),
    ],
    invoices: [
      invoice({
        id: "inv1",
        lines: [
          {
            boqItemId: "b1",
            itemName: "Panel",
            termKey: "supply",
            billedQty: 1,
            rate: 10,
            termPercent: 100,
            lineNet: 10,
          },
        ],
      }),
    ],
    itemCatalog: [
      { key: "panel", name: "Panel", unit: "Nos", lastRate: 10 },
      { key: "washer", name: "Washer", unit: "Nos", lastRate: 1 },
    ],
  });
  const incomingContracts = [
    contract({
      id: "c1",
      boq: [
        { ...line("b1", "Panel", 2), name: "Control panel", catalogKey: "control panel" },
        { ...line("b2", "Washer", 1, 1), name: "Shim" },
      ],
    }),
  ];
  const kept = keepInUseItemNames(
    current,
    incomingContracts,
    current.invoices,
    [{ key: "control panel", name: "Control panel", unit: "Nos", lastRate: 10 }]
  );
  assert.equal(kept.contracts[0]?.boq[0]?.name, "Panel");
  assert.equal(kept.contracts[0]?.boq[1]?.name, "Shim");
  assert.equal(kept.invoices[0]?.lines[0]?.itemName, "Panel");
  const names = itemNameChoices({ ...current, ...kept }).map((choice) => choice.name);
  assert.deepEqual(names, ["Panel", "Shim"]);
});

test("an unchanged name does not rewrite the hub", () => {
  const data = workspace({
    contracts: [contract({ id: "c1", boq: [line("b1", "Panel", 2)] })],
    itemCatalog: [{ key: "panel", name: "Panel", unit: "Nos", lastRate: 10 }],
  });
  const result = renameItemRecords(data, "Panel", "Panel");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data, data);
});
