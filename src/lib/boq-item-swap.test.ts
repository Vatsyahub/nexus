import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccess } from "@/lib/access";
import { swapContractBoqItem } from "@/lib/boq-item-swap";
import { buildItemListRows } from "@/lib/execution-reports";
import {
  addContract,
  addInvoice,
  editContractBoq,
  getData,
  replaceContractBoqItem,
} from "@/lib/store";
import {
  EMPTY_NEXUS_COSTS,
  boqTotal,
  type BoqItem,
  type Contract,
  type DeliveryChallan,
  type FlowhubData,
  type InstallationProgress,
  type Invoice,
  type ScheduleLine,
} from "@/lib/types";
import { diffWorkspace } from "@/lib/workspace-changes";
import { resolveWorkspaceWrite } from "@/lib/workspace-guard";
import type { ClearanceRole } from "@/lib/clearance";

function line(
  id: string,
  name: string,
  quantity: number,
  rate: number,
  unit: string,
  catalogKey = name.trim().toLowerCase()
): BoqItem {
  return { id, catalogKey, name, unit, rate, quantity };
}

function contract(
  id: string,
  city: string,
  boq: BoqItem[],
  amendments: Contract["amendments"] = []
): Contract {
  return {
    id,
    projectName: id,
    projectNo: id,
    orderNos: id,
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: boqTotal(boq),
    gstApplicable: false,
    city,
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
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    retentionRecoveredAt: null,
    contractorAssigned: "",
    handoverDate: null,
    boq,
    amendments,
    expenses: [],
    guaranteeEdits: [],
    status: "active",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

function invoice(
  id: string,
  contractId: string,
  lines: Invoice["lines"]
): Invoice {
  return {
    id,
    type: "PI",
    number: id,
    date: "2026-10-02",
    contractId,
    lines,
    netAmount: 300,
    gstAmount: 0,
    extraCharges: [],
    finalAmount: 300,
    convertedFromPiId: null,
    createdAt: "2026-10-02T00:00:00.000Z",
  };
}

function hub(partial: Partial<FlowhubData> & Pick<FlowhubData, "contracts">): FlowhubData {
  return {
    workspaceRevision: 4,
    contracts: partial.contracts,
    tasks: [],
    itemCatalog: partial.itemCatalog ?? [],
    invoices: partial.invoices ?? [],
    payments: [],
    schedules: partial.schedules ?? [],
    scheduleChangeLog: [],
    taskDeadlineChangeLog: [],
    notifications: [],
    customDepartments: [],
    departmentRenames: {},
    deletedDepartments: [],
    expenseCategories: [],
    deliveryChallans: partial.deliveryChallans ?? [],
    installationProgress: partial.installationProgress ?? [],
    nexusCosts: EMPTY_NEXUS_COSTS,
    ...partial,
  };
}

function fixture() {
  const bolt = line("b1", "Bolt", 10, 50, "Nos", "bolt");
  const cable = line("b2", "Cable", 4, 20, "m", "cab-1");
  const otherBolt = line("b3", "Bolt", 2, 50, "Nos", "bolt");
  const challan: DeliveryChallan = {
    id: "dc1",
    contractId: "a",
    dcNo: "DC-1",
    date: "2026-10-03",
    lines: [{ boqItemId: "b1", qty: 3 }],
    createdAt: "2026-10-03T00:00:00.000Z",
    createdBy: null,
  };
  const schedule = {
    id: "s1",
    contractId: "a",
    boqItemId: "b1",
    kind: "supply",
    quantity: 3,
    startDate: "2026-10-04",
    endDate: "2026-10-05",
    committed: true,
    baselineStartDate: "",
    baselineEndDate: "",
    done: false,
    doneAt: null,
    doneBy: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    updatedAt: "2026-10-04T00:00:00.000Z",
  } as ScheduleLine;
  const installed = {
    id: "ip1",
    contractId: "a",
    boqItemId: "b1",
    installedQty: 1,
    lastUpdatedAt: "2026-10-05",
    history: [],
  } as InstallationProgress;
  const data = hub({
    contracts: [
      contract("a", "Delhi", [bolt]),
      contract("b", "Mumbai", [cable]),
      contract("c", "Delhi", [otherBolt]),
    ],
    itemCatalog: [
      { key: "bolt", name: "Bolt", unit: "Nos", lastRate: 50 },
      { key: "cab-1", name: "Cable", unit: "m", lastRate: 20 },
    ],
    invoices: [
      invoice("inv-a", "a", [
        {
          boqItemId: "b1",
          itemName: "Bolt",
          termKey: "supply",
          billedQty: 6,
          rate: 50,
          termPercent: 100,
          lineNet: 300,
        },
        {
          boqItemId: "other",
          itemName: "Washer",
          termKey: "supply",
          billedQty: 1,
          rate: 5,
          termPercent: 100,
          lineNet: 5,
        },
      ]),
      invoice("inv-a2", "a", [
        {
          boqItemId: "b1",
          itemName: "Bolt",
          termKey: "supply",
          billedQty: 2,
          rate: 50,
          termPercent: 100,
          lineNet: 100,
        },
      ]),
      invoice("inv-c", "c", [
        {
          boqItemId: "b1",
          itemName: "Bolt",
          termKey: "supply",
          billedQty: 1,
          rate: 50,
          termPercent: 100,
          lineNet: 50,
        },
      ]),
    ],
    schedules: [schedule],
    deliveryChallans: [challan],
    installationProgress: [installed],
  });
  return { data, bolt, cable, otherBolt, challan, schedule, installed };
}

function swapped(clearance: string | null | undefined = "master", itemKey = "cab-1") {
  const built = fixture();
  return { ...built, result: swapContractBoqItem(built.data, {
    contractId: "a",
    boqItemId: "b1",
    itemKey,
    clearance,
  }) };
}

function saveAs(
  current: FlowhubData,
  incoming: FlowhubData,
  role: ClearanceRole
) {
  const result = resolveWorkspaceWrite(
    current,
    {
      baseRevision: current.workspaceRevision ?? 0,
      changes: diffWorkspace(current, incoming),
    },
    defaultAccess(role),
    role
  );
  assert.equal(result.action, "save");
  if (result.action !== "save") throw new Error("expected save");
  return result.data;
}

test("Master replaces one in-use line with an existing item and leaves rate, quantity, unit, and the catalog", () => {
  const { data, result, challan, schedule, installed } = swapped();
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const line = result.data.contracts.find((row) => row.id === "a")?.boq[0];
  assert.ok(line);
  assert.equal(line.id, "b1");
  assert.equal(line.name, "Cable");
  assert.equal(line.catalogKey, "cab-1");
  assert.equal(line.rate, 50);
  assert.equal(line.quantity, 10);
  assert.equal(line.unit, "Nos");
  assert.equal(result.data.contracts.find((row) => row.id === "a")?.amendments.length, 0);
  assert.equal(result.data.contracts.find((row) => row.id === "b")?.boq[0]?.name, "Cable");
  assert.equal(result.data.contracts.find((row) => row.id === "c")?.boq[0]?.name, "Bolt");

  const first = result.data.invoices.find((row) => row.id === "inv-a");
  const second = result.data.invoices.find((row) => row.id === "inv-a2");
  const otherContract = result.data.invoices.find((row) => row.id === "inv-c");
  assert.equal(first?.lines[0]?.itemName, "Cable");
  assert.equal(first?.lines[0]?.boqItemId, "b1");
  assert.equal(first?.lines[0]?.rate, 50);
  assert.equal(first?.lines[0]?.billedQty, 6);
  assert.equal(first?.lines[0]?.lineNet, 300);
  assert.equal(first?.lines[1]?.itemName, "Washer");
  assert.equal(first?.lines[1]?.rate, 5);
  assert.equal(first?.lines[1]?.billedQty, 1);
  assert.equal(second?.lines[0]?.itemName, "Cable");
  assert.equal(second?.lines[0]?.rate, 50);
  assert.equal(second?.lines[0]?.billedQty, 2);
  assert.equal(otherContract?.lines[0]?.itemName, "Bolt");
  assert.equal(otherContract?.lines[0]?.billedQty, 1);

  const cableEntry = result.data.itemCatalog.find((entry) => entry.key === "cab-1");
  const boltEntry = result.data.itemCatalog.find((entry) => entry.key === "bolt");
  assert.equal(cableEntry?.name, "Cable");
  assert.equal(cableEntry?.unit, "m");
  assert.equal(cableEntry?.lastRate, 20);
  assert.equal(boltEntry?.unit, "Nos");
  assert.equal(boltEntry?.lastRate, 50);
  assert.equal(result.data.itemCatalog, data.itemCatalog);
  assert.equal(result.data.deliveryChallans, data.deliveryChallans);
  assert.equal(result.data.schedules, data.schedules);
  assert.equal(result.data.installationProgress, data.installationProgress);
  assert.deepEqual(challan.lines, [{ boqItemId: "b1", qty: 3 }]);
  assert.equal(schedule.boqItemId, "b1");
  assert.equal(installed.boqItemId, "b1");
  assert.equal(installed.installedQty, 1);
  assert.equal(data.contracts[0]?.boq[0]?.name, "Bolt");
});

test("operations item list counts the swapped line under the new item", () => {
  const { data, result } = swapped();
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const before = buildItemListRows(data);
  const beforeBolt = before.find((row) => row.key === "bolt");
  const beforeCable = before.find((row) => row.key === "cable");
  assert.equal(beforeBolt?.totalQty, 12);
  assert.equal(beforeBolt?.totalSupplied, 3);
  assert.equal(beforeCable?.totalQty, 4);
  assert.equal(beforeCable?.totalSupplied, 0);

  const line = result.data.contracts.find((row) => row.id === "a")?.boq[0];
  assert.equal(line?.quantity, 10);
  const after = buildItemListRows(result.data);
  const bolt = after.find((row) => row.key === "bolt");
  const cable = after.find((row) => row.key === "cable");
  assert.equal(bolt?.totalQty, 2);
  assert.equal(bolt?.totalSupplied, 0);
  assert.equal(cable?.totalQty, 14);
  assert.equal(cable?.totalSupplied, 3);
  assert.equal(result.data.deliveryChallans, data.deliveryChallans);
  assert.deepEqual(result.data.deliveryChallans[0]?.lines, [{ boqItemId: "b1", qty: 3 }]);
});

test("a BOQ item swap is rejected for anyone who is not Master", () => {
  for (const clearance of ["user", "manager", "director", null] as const) {
    const { data, result } = swapped(clearance);
    assert.equal(result.ok, false, String(clearance));
    if (result.ok) continue;
    assert.match(result.error, /Only Master/);
    assert.equal(data.contracts[0]?.boq[0]?.name, "Bolt");
    assert.equal(data.invoices[0]?.lines[0]?.itemName, "Bolt");
  }
});

test("a BOQ item swap is rejected when the contract has an amendment", () => {
  const { data } = fixture();
  const amended = {
    ...data,
    contracts: data.contracts.map((row) =>
      row.id === "a"
        ? {
            ...row,
            amendments: [
              {
                id: "amd-1",
                seq: 1,
                number: "A1",
                date: "2026-10-06",
                at: "2026-10-06T00:00:00.000Z",
                by: null,
                note: "",
                previousOrderValue: 500,
                newOrderValue: 500,
                previousBoqTotal: 500,
                newBoqTotal: 500,
                lineDiffs: [],
                boqSnapshot: row.boq,
              },
            ],
          }
        : row
    ),
  };
  const result = swapContractBoqItem(amended, {
    contractId: "a",
    boqItemId: "b1",
    itemKey: "cab-1",
    clearance: "master",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /amendment/);
  assert.equal(amended.contracts[0]?.boq[0]?.name, "Bolt");
  assert.equal(amended.contracts[0]?.amendments[0]?.boqSnapshot[0]?.name, "Bolt");
});

test("a BOQ item swap is rejected when the name is already on the contract", () => {
  const { data } = fixture();
  const duplicate = {
    ...data,
    contracts: data.contracts.map((row) =>
      row.id === "a"
        ? { ...row, boq: [...row.boq, line("b4", "Cable", 1, 20, "m", "cab-1")] }
        : row
    ),
  };
  const result = swapContractBoqItem(duplicate, {
    contractId: "a",
    boqItemId: "b1",
    itemKey: "cab-1",
    clearance: "master",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /already on this contract/);
  assert.equal(duplicate.contracts[0]?.boq[0]?.name, "Bolt");
});

test("a BOQ item swap is rejected when the item does not exist", () => {
  const { data, result } = swapped("master", "no-such-item");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /does not exist/);
  assert.equal(data.contracts[0]?.boq[0]?.name, "Bolt");
  assert.equal(data.itemCatalog.length, 2);
});

test("a later non-Master save keeps the new item name", () => {
  const { result } = swapped();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const current = result.data;
  const incoming = structuredClone(current);
  const line = incoming.contracts[0]?.boq[0];
  assert.ok(line);
  line.name = "Bolt";
  line.catalogKey = "bolt";
  line.unit = "Set";
  const invoiceLine = incoming.invoices[0]?.lines[0];
  assert.ok(invoiceLine);
  invoiceLine.itemName = "Bolt";
  for (const role of ["user", "director", "manager"] as const) {
    const saved = saveAs(current, incoming, role);
    const kept = saved.contracts.find((row) => row.id === "a")?.boq[0];
    assert.equal(kept?.name, "Cable", role);
    assert.equal(kept?.catalogKey, "cab-1", role);
    assert.equal(kept?.quantity, 10, role);
    assert.equal(kept?.rate, 50, role);
    assert.equal(kept?.unit, "Nos", role);
    assert.equal(saved.invoices.find((row) => row.id === "inv-a")?.lines[0]?.itemName, "Cable", role);
    assert.equal(
      saved.itemCatalog.find((entry) => entry.key === "cab-1")?.lastRate,
      20,
      role
    );
  }
});

test("the server keeps a Master swap onto an existing item and restores the catalog rate and unit", () => {
  const { data } = fixture();
  const incoming = structuredClone(data);
  const line = incoming.contracts[0]?.boq[0];
  assert.ok(line);
  line.name = "Cable";
  line.catalogKey = "cab-1";
  const invoiceLine = incoming.invoices[0]?.lines[0];
  assert.ok(invoiceLine);
  invoiceLine.itemName = "cable";
  const catalog = incoming.itemCatalog.find((entry) => entry.key === "cab-1");
  assert.ok(catalog);
  catalog.unit = "Nos";
  catalog.lastRate = 50;
  catalog.name = "cable";
  const saved = saveAs(data, incoming, "master");
  const kept = saved.contracts.find((row) => row.id === "a")?.boq[0];
  assert.equal(kept?.name, "Cable");
  assert.equal(kept?.catalogKey, "cab-1");
  assert.equal(kept?.rate, 50);
  assert.equal(kept?.quantity, 10);
  assert.equal(kept?.unit, "Nos");
  assert.equal(saved.invoices.find((row) => row.id === "inv-a")?.lines[0]?.itemName, "Cable");
  assert.equal(saved.invoices.find((row) => row.id === "inv-a")?.lines[0]?.billedQty, 6);
  const entry = saved.itemCatalog.find((row) => row.key === "cab-1");
  assert.equal(entry?.name, "Cable");
  assert.equal(entry?.unit, "m");
  assert.equal(entry?.lastRate, 20);
});

test("the server rejects a Master rename onto an item that does not exist", () => {
  const { data } = fixture();
  const incoming = structuredClone(data);
  const line = incoming.contracts[0]?.boq[0];
  assert.ok(line);
  line.name = "Nut";
  line.catalogKey = "nut";
  line.rate = 9;
  const invoiceLine = incoming.invoices[0]?.lines[0];
  assert.ok(invoiceLine);
  invoiceLine.itemName = "Nut";
  incoming.itemCatalog.push({ key: "nut", name: "Nut", unit: "Set", lastRate: 9 });
  const saved = saveAs(data, incoming, "master");
  const kept = saved.contracts.find((row) => row.id === "a")?.boq[0];
  assert.equal(kept?.name, "Bolt");
  assert.equal(kept?.catalogKey, "bolt");
  assert.equal(kept?.rate, 9);
  assert.equal(kept?.quantity, 10);
  assert.equal(saved.invoices.find((row) => row.id === "inv-a")?.lines[0]?.itemName, "Bolt");
  assert.equal(saved.itemCatalog.some((entry) => entry.key === "nut"), false);
  assert.equal(saved.itemCatalog.find((entry) => entry.key === "bolt")?.lastRate, 50);
});

test("the server rejects a Master swap when the contract has an amendment", () => {
  const { data } = fixture();
  data.contracts[0]?.amendments.push({
    id: "amd-1",
    seq: 1,
    number: "A1",
    date: "2026-10-06",
    at: "2026-10-06T00:00:00.000Z",
    by: null,
    note: "",
    previousOrderValue: 500,
    newOrderValue: 500,
    previousBoqTotal: 500,
    newBoqTotal: 500,
    lineDiffs: [],
    boqSnapshot: structuredClone(data.contracts[0].boq),
  });
  const incoming = structuredClone(data);
  const line = incoming.contracts[0]?.boq[0];
  assert.ok(line);
  line.name = "Cable";
  line.catalogKey = "cab-1";
  const invoiceLine = incoming.invoices[0]?.lines[0];
  assert.ok(invoiceLine);
  invoiceLine.itemName = "Cable";
  const saved = saveAs(data, incoming, "master");
  assert.equal(saved.contracts.find((row) => row.id === "a")?.boq[0]?.name, "Bolt");
  assert.equal(saved.contracts.find((row) => row.id === "a")?.boq[0]?.catalogKey, "bolt");
  assert.equal(saved.invoices.find((row) => row.id === "inv-a")?.lines[0]?.itemName, "Bolt");
  assert.equal(saved.contracts.find((row) => row.id === "a")?.amendments[0]?.boqSnapshot[0]?.name, "Bolt");
});

function makeContract(projectNo: string, boq: BoqItem[]): Contract {
  const created = addContract({
    projectName: projectNo,
    projectNo,
    orderNos: projectNo,
    orderDate: "2026-10-01",
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
    contractorAssigned: "",
    boq,
  });
  return created.contract;
}

test("plain BOQ edit still locks the name, including after Master replaces the item", () => {
  const bolt = line("swap-lock-bolt", "Bolt", 10, 50, "Nos");
  const cable = line("swap-lock-cable", "Cable", 4, 20, "m");
  const contractA = makeContract("C-SWAP-LOCK", [bolt]);
  makeContract("C-SWAP-CABLE", [cable]);
  const created = addInvoice({
    type: "PI",
    number: "PI-SWAP-LOCK",
    date: "2026-10-02",
    contractId: contractA.id,
    lines: [
      {
        boqItemId: bolt.id,
        itemName: "Bolt",
        termKey: "supply",
        billedQty: 6,
        rate: 50,
        termPercent: 100,
        lineNet: 300,
      },
    ],
  });
  assert.ok(created);

  const blocked = editContractBoq({
    contractId: contractA.id,
    boq: [{ ...bolt, name: "Cable", catalogKey: "cable" }],
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.match(blocked.error, /name stays locked/);
  assert.equal(
    getData().contracts.find((row) => row.id === contractA.id)?.boq[0]?.name,
    "Bolt"
  );

  const denied = replaceContractBoqItem({
    contractId: contractA.id,
    boqItemId: bolt.id,
    itemKey: "cable",
    clearance: "director",
  });
  assert.equal(denied.ok, false);
  if (denied.ok) return;
  assert.match(denied.error, /Only Master/);

  const replaced = replaceContractBoqItem({
    contractId: contractA.id,
    boqItemId: bolt.id,
    itemKey: "cable",
    clearance: "master",
  });
  assert.equal(replaced.ok, true);
  if (!replaced.ok) return;
  const lineNow = getData().contracts.find((row) => row.id === contractA.id)?.boq[0];
  assert.equal(lineNow?.id, bolt.id);
  assert.equal(lineNow?.name, "Cable");
  assert.equal(lineNow?.catalogKey, "cable");
  assert.equal(lineNow?.rate, 50);
  assert.equal(lineNow?.quantity, 10);
  assert.equal(lineNow?.unit, "Nos");
  const storedInvoice = getData().invoices.find((row) => row.id === created?.id);
  assert.equal(storedInvoice?.lines[0]?.itemName, "Cable");
  assert.equal(storedInvoice?.lines[0]?.rate, 50);
  assert.equal(storedInvoice?.lines[0]?.billedQty, 6);
  const cableEntry = getData().itemCatalog.find((entry) => entry.key === "cable");
  assert.equal(cableEntry?.unit, "m");
  assert.equal(cableEntry?.lastRate, 20);
  const boltEntry = getData().itemCatalog.find((entry) => entry.key === "bolt");
  assert.equal(boltEntry?.unit, "Nos");
  assert.equal(boltEntry?.lastRate, 50);

  const lockedAgain = editContractBoq({
    contractId: contractA.id,
    boq: [{ ...lineNow!, name: "Nut", catalogKey: "nut" }],
  });
  assert.equal(lockedAgain.ok, false);
  if (lockedAgain.ok) return;
  assert.match(lockedAgain.error, /name stays locked/);
  assert.equal(
    getData().contracts.find((row) => row.id === contractA.id)?.boq[0]?.name,
    "Cable"
  );
});
