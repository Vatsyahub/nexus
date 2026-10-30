import assert from "node:assert/strict";
import test from "node:test";
import { DOORS, defaultAccess, doorForPath, levelForPath } from "@/lib/access";
import {
  buildDispatchListRows,
  buildInstallationListRows,
  buildScheduleFulfilmentRows,
  filterDispatchListRows,
  filterInstallationListRows,
  formatDispatchItems,
  formatQtyWithUnit,
} from "@/lib/execution-reports";
import { LIST_WINDOW_LIMIT, windowList } from "@/lib/list-window";
import {
  addContract,
  addDeliveryChallan,
  addExpense,
  addSchedule,
  deleteDeliveryChallan,
  getData,
  recordInstallationTotal,
  updateExpense,
} from "@/lib/store";
import {
  boqTotal,
  type BoqItem,
  type Contract,
  type DeliveryChallan,
  type FlowhubData,
  type InstallationProgress,
} from "@/lib/types";

function item(id: string, name: string, quantity = 10): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase(),
    name,
    unit: "Nos",
    rate: 10,
    quantity,
  };
}

function workspace(partial: Partial<FlowhubData>): FlowhubData {
  return partial as FlowhubData;
}

function contractBits(
  partial: Partial<Contract> & Pick<Contract, "id" | "projectNo" | "projectName">
): Contract {
  return partial as Contract;
}

test("dispatch list keeps the same challan, qty, and contract", () => {
  const panel = item("b1", "Panel");
  const cable = item("b2", "Cable");
  cable.unit = "Mtr";
  const dc: DeliveryChallan = {
    id: "dc-1",
    contractId: "c1",
    dcNo: "DC-14",
    date: "2026-04-01",
    createdAt: "2026-04-01T00:00:00.000Z",
    createdBy: "Ada",
    lines: [
      { boqItemId: "b1", qty: 7 },
      { boqItemId: "b2", qty: 8 },
    ],
  };
  const before = structuredClone(dc);
  const data = workspace({
    contracts: [
      contractBits({
        id: "c1",
        projectNo: "P-1",
        projectName: "North shed",
        city: "Delhi",
        contractorAssigned: "Acme Builder",
        orderValue: 88000,
        boq: [panel, cable],
      }),
    ],
    deliveryChallans: [dc],
    installationProgress: [],
  });
  const rows = buildDispatchListRows(data);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.dcId, "dc-1");
  assert.equal(rows[0]?.contractId, "c1");
  assert.deepEqual(
    rows[0]?.items.map((line) => [line.boqItemId, line.qty, line.unit]),
    [
      ["b1", 7, "Nos"],
      ["b2", 8, "Mtr"],
    ]
  );
  assert.equal(formatDispatchItems(rows[0]?.items ?? []), "Panel × 7 Nos, Cable × 8 Mtr");
  assert.equal(formatQtyWithUnit(64, "Nos"), "64 Nos");
  assert.equal(formatQtyWithUnit(64, "  "), "64");
  assert.deepEqual(dc, before);

  assert.equal(filterDispatchListRows(rows, "North").length, 1);
  assert.equal(filterDispatchListRows(rows, "P-1").length, 1);
  assert.equal(filterDispatchListRows(rows, "Panel").length, 1);
  assert.equal(filterDispatchListRows(rows, "dc-14").length, 1);
  assert.equal(filterDispatchListRows(rows, "Delhi").length, 0);
  assert.equal(filterDispatchListRows(rows, "Acme").length, 0);
  assert.equal(filterDispatchListRows(rows, "88000").length, 0);
  assert.equal(filterDispatchListRows(rows, "7").length, 0);
  assert.equal(filterDispatchListRows(rows, "8").length, 0);
});

test("installations group one project and date, and keep stored qty", () => {
  const progress: InstallationProgress[] = [
    {
      id: "ip-panel",
      contractId: "c1",
      boqItemId: "b1",
      installedQty: 4,
      lastUpdatedAt: "2026-04-02",
      history: [
        {
          id: "h1",
          at: "2026-04-02",
          recordedAt: "2026-04-02T01:00:00.000Z",
          totalAfter: 4,
          delta: 4,
          by: "Ada",
        },
      ],
    },
    {
      id: "ip-cable",
      contractId: "c1",
      boqItemId: "b2",
      installedQty: 1,
      lastUpdatedAt: "2026-04-02",
      history: [
        {
          id: "h2",
          at: "2026-04-02",
          recordedAt: "2026-04-02T02:00:00.000Z",
          totalAfter: 1,
          delta: 1,
          by: "Ada",
        },
      ],
    },
  ];
  const before = structuredClone(progress);
  const data = workspace({
    contracts: [
      contractBits({
        id: "c1",
        projectNo: "P-1",
        projectName: "North shed",
        city: "Delhi",
        contractorAssigned: "Acme Builder",
        boq: [item("b1", "Panel"), item("b2", "Cable")],
      }),
    ],
    deliveryChallans: [
      {
        id: "dc-1",
        contractId: "c1",
        dcNo: "DC-14",
        date: "2026-04-01",
        createdAt: "2026-04-01T00:00:00.000Z",
        createdBy: null,
        lines: [
          { boqItemId: "b1", qty: 6 },
          { boqItemId: "b2", qty: 3 },
        ],
      },
    ],
    installationProgress: progress,
  });
  const rows = buildInstallationListRows(data);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.contractId, "c1");
  assert.equal(rows[0]?.date, "2026-04-02");
  assert.deepEqual(
    rows[0]?.items.map((line) => [
      line.progressId,
      line.itemName,
      line.qtyBefore,
      line.delta,
      line.qtyNow,
    ]),
    [
      ["ip-panel", "Panel", 0, 4, 4],
      ["ip-cable", "Cable", 0, 1, 1],
    ]
  );
  assert.deepEqual(
    rows[0]?.pending.map((line) => [line.itemName, line.left]),
    [
      ["Panel", 2],
      ["Cable", 2],
    ]
  );
  assert.deepEqual(progress, before);
  assert.equal(filterInstallationListRows(rows, "Cable").length, 1);
  assert.equal(filterInstallationListRows(rows, "North").length, 1);
  assert.equal(filterInstallationListRows(rows, "Delhi").length, 0);
  assert.equal(filterInstallationListRows(rows, "Acme").length, 0);
});

test("a dispatch window cuts rows and leaves the stored challans alone", () => {
  const challans: DeliveryChallan[] = Array.from({ length: 101 }, (_, i) => ({
    id: `dc-${i}`,
    contractId: "c1",
    dcNo: `DC-${i}`,
    date: "2026-04-01",
    createdAt: `2026-04-01T00:${String(i).padStart(2, "0")}:00.000Z`,
    createdBy: null,
    lines: [{ boqItemId: "b1", qty: 1 }],
  }));
  const data = workspace({
    contracts: [
      contractBits({
        id: "c1",
        projectNo: "P-1",
        projectName: "North shed",
        boq: [item("b1", "Panel", 500)],
      }),
    ],
    deliveryChallans: challans,
  });
  const rows = buildDispatchListRows(data);
  const windowed = windowList(rows, {
    filtered: false,
    order: "latest",
    date: (row) => row.dcDate,
    createdAt: (row) => row.createdAt,
    today: "2026-10-30",
  });
  assert.equal(windowed.rows.length, LIST_WINDOW_LIMIT);
  assert.equal(windowed.capped, true);
  assert.equal(data.deliveryChallans.length, 101);
  assert.equal(data.deliveryChallans[0]?.lines[0]?.qty, 1);
});

test("operations reuses the expenses door and Site Records keeps its door", () => {
  assert.equal(
    DOORS.find((door) => door.id === "expenses")?.label,
    "Operations"
  );
  assert.equal(
    DOORS.find((door) => door.id === "reports_operations")?.label,
    "Site Records"
  );
  assert.equal(doorForPath("/operations"), "expenses");
  assert.equal(doorForPath("/operations/dispatch/dc-1"), "expenses");
  assert.equal(doorForPath("/operations/dispatch/new"), "expenses");
  assert.equal(doorForPath("/operations/installations/c1"), "expenses");
  assert.equal(doorForPath("/expenses"), "expenses");
  assert.equal(doorForPath("/expenses/new"), "expenses");
  assert.equal(doorForPath("/reports/execution"), "reports_operations");
  assert.equal(doorForPath("/schedules"), "schedules");
  assert.equal(doorForPath("/contracts/c1"), "contracts");
  assert.equal(doorForPath("/billing/inv-1"), "billing");
  assert.equal(doorForPath("/payments/pay-1"), "payments");

  const blocked = defaultAccess("user");
  blocked.expenses = "block";
  blocked.reports_operations = "edit";
  assert.equal(levelForPath("/operations", blocked), "block");
  assert.equal(levelForPath("/operations/dispatch/new", blocked), "block");
  assert.equal(levelForPath("/operations/dispatch/dc-1", blocked), "view");
  assert.equal(levelForPath("/reports/execution", blocked), "edit");

  const view = defaultAccess("master");
  view.expenses = "view";
  assert.equal(levelForPath("/operations", view), "view");
  assert.equal(levelForPath("/operations/dispatch/dc-1", view), "view");

  const edit = defaultAccess("user");
  edit.expenses = "edit";
  edit.reports_operations = "block";
  assert.equal(levelForPath("/operations", edit), "edit");
  assert.equal(levelForPath("/reports/execution", edit), "block");
});

test("saving a DC, installation, expense, and schedule still hits the same ids", () => {
  const panel = item("panel", "Panel", 10);
  const cable = item("cable", "Cable", 10);
  const boq = [panel, cable];
  const contract = addContract({
    projectName: "Ops move",
    projectNo: `OPS-${Date.now()}`,
    orderNos: "WO-OPS",
    orderDate: "2026-04-01",
    closureDate: "2026-12-31",
    orderValue: boqTotal(boq),
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
    contractorAssigned: "Acme Builder",
    boq,
  }).contract;

  const kept = addDeliveryChallan(
    {
      contractId: contract.id,
      dcNo: "DC-KEEP",
      date: "2026-04-01",
      lines: [
        { boqItemId: panel.id, qty: 6 },
        { boqItemId: cable.id, qty: 3 },
      ],
    },
    { by: "Ada" }
  );
  assert.equal(kept.ok, true);
  if (!kept.ok) return;
  const dropped = addDeliveryChallan(
    {
      contractId: contract.id,
      dcNo: "DC-DROP",
      date: "2026-04-01",
      lines: [{ boqItemId: panel.id, qty: 1 }],
    },
    { by: "Ada" }
  );
  assert.equal(dropped.ok, true);
  if (!dropped.ok) return;

  const listed = buildDispatchListRows(getData()).find(
    (row) => row.dcId === kept.value.id
  );
  assert.equal(listed?.contractId, contract.id);
  assert.deepEqual(
    listed?.items.map((line) => [line.boqItemId, line.qty]),
    [
      [panel.id, 6],
      [cable.id, 3],
    ]
  );

  const removed = deleteDeliveryChallan(dropped.value.id);
  assert.equal(removed.ok, true);
  assert.equal(
    getData().deliveryChallans.some((row) => row.id === dropped.value.id),
    false
  );
  assert.equal(
    getData().deliveryChallans.find((row) => row.id === kept.value.id)?.lines[0]
      ?.qty,
    6
  );

  const panelInstall = recordInstallationTotal(
    {
      contractId: contract.id,
      boqItemId: panel.id,
      newTotal: 4,
      date: "2026-04-02",
    },
    { by: "Ada" }
  );
  const cableInstall = recordInstallationTotal(
    {
      contractId: contract.id,
      boqItemId: cable.id,
      newTotal: 1,
      date: "2026-04-02",
    },
    { by: "Ada" }
  );
  assert.equal(panelInstall.ok, true);
  assert.equal(cableInstall.ok, true);
  if (!panelInstall.ok || !cableInstall.ok) return;
  const day = buildInstallationListRows(getData()).find(
    (row) => row.contractId === contract.id && row.date === "2026-04-02"
  );
  assert.equal(day?.items.length, 2);
  assert.equal(
    day?.items.find((line) => line.progressId === panelInstall.value.id)
      ?.qtyNow,
    4
  );
  const again = recordInstallationTotal(
    {
      contractId: contract.id,
      boqItemId: panel.id,
      newTotal: 5,
      date: "2026-04-03",
    },
    { by: "Ada" }
  );
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.value.id, panelInstall.value.id);
  const nextDay = buildInstallationListRows(getData()).find(
    (row) => row.contractId === contract.id && row.date === "2026-04-03"
  );
  assert.equal(nextDay?.items[0]?.qtyBefore, 4);
  assert.equal(nextDay?.items[0]?.delta, 1);
  assert.equal(nextDay?.items[0]?.qtyNow, 5);
  assert.equal(nextDay?.items[0]?.progressId, panelInstall.value.id);

  const expense = addExpense(
    contract.id,
    {
      amount: 25,
      date: "2026-04-04",
      personPaid: "Ravi",
      reason: "Fuel",
      category: "Travel",
    },
    { by: "Ada" }
  );
  assert.ok(expense);
  if (!expense) return;
  const edited = updateExpense(
    contract.id,
    expense.id,
    {
      amount: 40,
      date: "2026-04-04",
      personPaid: "Ravi",
      reason: "Fuel",
      category: "Travel",
    },
    { by: "Ada" }
  );
  assert.equal(edited.ok, true);
  const storedExpense = getData()
    .contracts.find((row) => row.id === contract.id)
    ?.expenses?.find((row) => row.id === expense.id);
  assert.equal(storedExpense?.amount, 40);
  assert.equal(storedExpense?.id, expense.id);

  const schedule = addSchedule(
    {
      contractId: contract.id,
      kind: "supply",
      boqItemId: panel.id,
      quantity: 2,
      startDate: "2026-05-01",
      endDate: "2026-05-02",
      committed: true,
    },
    { by: "Ada" }
  );
  assert.equal(schedule.ok, true);
  if (!schedule.ok) return;
  const storedLine = getData().schedules.find(
    (row) => row.id === schedule.line.id
  );
  assert.equal(storedLine?.contractId, contract.id);
  assert.equal(storedLine?.quantity, 2);
  const reportLine = buildScheduleFulfilmentRows(getData()).find(
    (row) => row.scheduleId === schedule.line.id
  );
  assert.equal(reportLine?.contractId, contract.id);
  assert.equal(reportLine?.plannedQty, 2);
  assert.equal(reportLine?.projectNo, contract.projectNo);
});
