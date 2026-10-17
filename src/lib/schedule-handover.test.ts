import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  getData,
  markScheduleDone,
  saveContractSchedulePlan,
  updateContract,
  updateSchedule,
} from "@/lib/store";
import { todayIso } from "@/lib/nexus-core";

test("handover keeps saved supply lines and an honest change log", () => {
  const boqA = "boq-handover-a";
  const boqB = "boq-handover-b";
  const created = addContract({
    projectName: "Handover preserve",
    projectNo: "C-HO-TEST",
    orderNos: "T-1",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 20000,
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
        id: boqA,
        catalogKey: "item-a",
        name: "Item A",
        unit: "Nos",
        rate: 100,
        quantity: 100,
      },
      {
        id: boqB,
        catalogKey: "item-b",
        name: "Item B",
        unit: "Nos",
        rate: 100,
        quantity: 100,
      },
    ],
  });

  const contractId = created.contract.id;
  const first = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: "",
      handoverDate: "",
      items: [
        {
          boqItemId: boqA,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-14",
              quantity: 100,
            },
          ],
          installations: [],
        },
        {
          boqItemId: boqB,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-14",
              quantity: 40,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(first.ok, true);

  const before = getData().schedules.filter((s) => s.contractId === contractId);
  const lineA = before.find((s) => s.boqItemId === boqA);
  const lineB = before.find((s) => s.boqItemId === boqB);
  assert.ok(lineA && lineB);

  const edited = updateSchedule(
    lineA.id,
    { endDate: "2026-10-16" },
    { by: "Tester" }
  );
  assert.equal(edited.ok, true);
  const qtyEdit = updateSchedule(
    lineB.id,
    { quantity: 80 },
    { by: "Tester" }
  );
  assert.equal(qtyEdit.ok, true);
  const done = markScheduleDone(lineA.id, {
    by: "Tester",
    done: true,
    completedDate: "2026-10-14",
  });
  assert.equal(done.ok, true);

  const logAfterEdit = getData().scheduleChangeLog.filter(
    (e) => e.contractId === contractId
  );
  const realEdit = logAfterEdit.filter(
    (e) => e.summary === "Updated Supply 14-Oct-2026 → 16-Oct-2026"
  );
  assert.equal(realEdit.length, 1);

  const updatedBeforeNoop = getData().scheduleChangeLog.filter(
    (e) => e.contractId === contractId && e.summary.startsWith("Updated Supply")
  ).length;
  const same = updateSchedule(
    lineA.id,
    {
      startDate: "2026-10-14",
      endDate: "2026-10-16",
      quantity: 100,
      committed: false,
    },
    { by: "Tester" }
  );
  assert.equal(same.ok, true);
  const updatedAfterNoop = getData().scheduleChangeLog.filter(
    (e) => e.contractId === contractId && e.summary.startsWith("Updated Supply")
  ).length;
  assert.equal(updatedAfterNoop, updatedBeforeNoop);

  const today = todayIso();
  const handover = saveContractSchedulePlan(
    {
      contractId,
      committed: true,
      testingDate: "",
      handoverDate: today,
      items: [
        {
          boqItemId: boqA,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-14",
              quantity: 100,
              edited: false,
            },
          ],
          installations: [],
        },
        {
          boqItemId: boqB,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-14",
              quantity: 40,
              edited: false,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(handover.ok, true);

  const after = getData();
  const supplies = after.schedules.filter(
    (s) => s.contractId === contractId && s.kind === "supply"
  );
  const savedA = supplies.find((s) => s.id === lineA.id);
  const savedB = supplies.find((s) => s.id === lineB.id);
  assert.ok(savedA, "supply line id must survive handover");
  assert.equal(savedA.startDate, "2026-10-14");
  assert.equal(savedA.endDate, "2026-10-16");
  assert.equal(savedA.quantity, 100);
  assert.equal(savedA.done, true);
  assert.equal(savedA.doneAt, "2026-10-14");
  assert.equal(savedA.committed, false);

  assert.ok(savedB);
  assert.equal(savedB.endDate, "2026-10-14");
  assert.equal(savedB.quantity, 80);

  const handoverLine = after.schedules.find(
    (s) => s.contractId === contractId && s.kind === "handover"
  );
  assert.ok(handoverLine);
  assert.equal(handoverLine.startDate, today);
  assert.equal(handoverLine.endDate, today);

  const contract = after.contracts.find((c) => c.id === contractId);
  assert.equal(contract?.handoverDate ?? null, null);
  assert.equal(contract?.status, "active");
  const stillOpen = updateContract(contractId, { status: "active" });
  assert.equal(stillOpen?.status, "active");

  const supplyDateUpdates = getData().scheduleChangeLog.filter(
    (e) =>
      e.contractId === contractId &&
      e.summary === "Updated Supply 14-Oct-2026 → 16-Oct-2026"
  );
  assert.equal(supplyDateUpdates.length, 1);
  const reverted = getData().scheduleChangeLog.filter(
    (e) =>
      e.contractId === contractId &&
      e.summary === "Updated Supply 14-Oct-2026"
  );
  assert.equal(reverted.length, 0);

  const moved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: "",
      handoverDate: today,
      handoverEdited: false,
      items: [
        {
          boqItemId: boqA,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-18",
              quantity: 100,
              edited: true,
            },
          ],
          installations: [],
        },
        {
          boqItemId: boqB,
          supplies: [
            {
              startDate: "2026-10-14",
              endDate: "2026-10-14",
              quantity: 40,
              edited: false,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(moved.ok, true);
  const movedA = getData().schedules.find((s) => s.id === lineA.id);
  const keptB = getData().schedules.find((s) => s.id === lineB.id);
  const keptHandover = getData().schedules.find(
    (s) => s.contractId === contractId && s.kind === "handover"
  );
  assert.equal(movedA?.endDate, "2026-10-18");
  assert.equal(keptB?.quantity, 80);
  assert.equal(keptHandover?.startDate, today);
  const afterMove = getData().contracts.find((c) => c.id === contractId);
  assert.equal(afterMove?.handoverDate ?? null, null);
  assert.equal(afterMove?.status, "active");
});

test("planner commitment edit updates uncommitted lines without touching dates", () => {
  const boqId = "boq-commit-flip";
  const created = addContract({
    projectName: "Commitment flip",
    projectNo: "C-COMMIT-FLIP",
    orderNos: "T-2",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 10000,
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
        id: boqId,
        catalogKey: "item-commit",
        name: "Commit Item",
        unit: "Nos",
        rate: 100,
        quantity: 10,
      },
    ],
  });
  const contractId = created.contract.id;
  const supply = {
    startDate: "2026-10-20",
    endDate: "2026-10-22",
    quantity: 10,
  };
  const installation = {
    startDate: "2026-10-25",
    endDate: "2026-10-28",
    quantity: 10,
  };
  const testingDate = "2026-11-01";
  const handoverDate = "2026-11-15";
  const first = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate,
      handoverDate,
      items: [
        {
          boqItemId: boqId,
          supplies: [supply],
          installations: [installation],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(first.ok, true);
  const before = getData().schedules.filter((s) => s.contractId === contractId);
  assert.equal(before.length, 4);
  assert.ok(before.every((s) => s.committed === false));
  const supplyLine = before.find((s) => s.kind === "supply");
  const installLine = before.find((s) => s.kind === "installation");
  assert.ok(supplyLine && installLine);

  const flipped = saveContractSchedulePlan(
    {
      contractId,
      committed: true,
      committedEdited: true,
      testingDate,
      testingEdited: false,
      handoverDate,
      handoverEdited: false,
      items: [
        {
          boqItemId: boqId,
          supplies: [{ ...supply, edited: false }],
          installations: [{ ...installation, edited: false }],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(flipped.ok, true);
  const after = getData().schedules.filter((s) => s.contractId === contractId);
  assert.equal(after.length, 4);
  assert.ok(
    after.every((s) => s.committed === true),
    after.map((s) => `${s.kind}:${s.committed}`).join(",")
  );
  const savedSupply = after.find((s) => s.id === supplyLine.id);
  const savedInstall = after.find((s) => s.id === installLine.id);
  assert.ok(savedSupply && savedInstall);
  assert.equal(savedSupply.startDate, supply.startDate);
  assert.equal(savedSupply.endDate, supply.endDate);
  assert.equal(savedSupply.quantity, supply.quantity);
  assert.equal(savedInstall.startDate, installation.startDate);
  assert.equal(savedInstall.endDate, installation.endDate);
  assert.equal(
    getData().scheduleChangeLog.some(
      (e) =>
        e.contractId === contractId && e.summary.endsWith(" · committed")
    ),
    true
  );

  const untouched = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      committedEdited: false,
      testingDate,
      testingEdited: false,
      handoverDate,
      handoverEdited: false,
      items: [
        {
          boqItemId: boqId,
          supplies: [{ ...supply, edited: false }],
          installations: [{ ...installation, edited: false }],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(untouched.ok, true);
  const kept = getData().schedules.filter((s) => s.contractId === contractId);
  assert.ok(kept.every((s) => s.committed === true));
  assert.equal(
    kept.find((s) => s.id === supplyLine.id)?.endDate,
    supply.endDate
  );
});
