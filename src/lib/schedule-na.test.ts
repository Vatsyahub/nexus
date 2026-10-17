import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  applyCascadeProposals,
  getData,
  saveContractSchedulePlan,
  updateSchedule,
} from "@/lib/store";
import { SCHEDULE_DATE_NA } from "@/lib/types";

function addScheduleContract(
  projectNo: string,
  boq: { id: string; name: string; quantity: number }[]
) {
  return addContract({
    projectName: projectNo,
    projectNo,
    orderNos: "T-NA",
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
    boq: boq.map((item) => ({
      id: item.id,
      catalogKey: item.id,
      name: item.name,
      unit: "Nos",
      rate: 100,
      quantity: item.quantity,
    })),
  });
}

function itemLines(contractId: string, boqItemId: string) {
  return getData().schedules.filter(
    (s) => s.contractId === contractId && s.boqItemId === boqItemId
  );
}

test("NA item saves with an empty supply qty and no schedule line", () => {
  const naId = "boq-na-empty";
  const keptId = "boq-na-kept";
  const created = addScheduleContract("C-NA-EMPTY", [
    { id: naId, name: "Skipped item", quantity: 5 },
    { id: keptId, name: "Kept item", quantity: 8 },
  ]);
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: SCHEDULE_DATE_NA,
      handoverDate: "2026-12-01",
      items: [
        {
          boqItemId: naId,
          supplies: [
            {
              startDate: SCHEDULE_DATE_NA,
              endDate: SCHEDULE_DATE_NA,
              quantity: 0,
              edited: true,
            },
          ],
          installations: [
            {
              startDate: "2026-11-02",
              endDate: "2026-11-03",
              quantity: 5,
              edited: true,
            },
          ],
        },
        {
          boqItemId: keptId,
          supplies: [
            {
              startDate: "2026-10-20",
              endDate: "2026-10-21",
              quantity: 8,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, true);
  assert.equal(itemLines(contractId, naId).length, 0);
  const kept = itemLines(contractId, keptId);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.kind, "supply");
  assert.equal(kept[0]?.quantity, 8);
  const testing = getData().schedules.find(
    (s) => s.contractId === contractId && s.kind === "testing"
  );
  const handover = getData().schedules.find(
    (s) => s.contractId === contractId && s.kind === "handover"
  );
  assert.equal(testing?.startDate, SCHEDULE_DATE_NA);
  assert.equal(handover?.startDate, "2026-12-01");
});

test("a non-NA item still cannot be saved without supply qty", () => {
  const boqId = "boq-na-required";
  const created = addScheduleContract("C-NA-REQUIRED", [
    { id: boqId, name: "Needs qty", quantity: 4 },
  ]);
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: "",
      handoverDate: "",
      items: [
        {
          boqItemId: boqId,
          supplies: [
            {
              startDate: "2026-10-20",
              endDate: "2026-10-21",
              quantity: 0,
              edited: true,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, false);
  if (saved.ok) return;
  assert.match(saved.error, /Supply qty must be > 0 for Needs qty/);
  assert.equal(itemLines(contractId, boqId).length, 0);
});

test("saving an item as NA removes its existing schedule line", () => {
  const naId = "boq-na-drop";
  const keptId = "boq-na-drop-kept";
  const created = addScheduleContract("C-NA-DROP", [
    { id: naId, name: "Was scheduled", quantity: 6 },
    { id: keptId, name: "Stays scheduled", quantity: 3 },
  ]);
  const contractId = created.contract.id;
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
          boqItemId: naId,
          supplies: [
            {
              startDate: "2026-10-10",
              endDate: "2026-10-12",
              quantity: 6,
            },
          ],
          installations: [
            {
              startDate: "2026-10-18",
              endDate: "2026-10-19",
              quantity: 6,
            },
          ],
        },
        {
          boqItemId: keptId,
          supplies: [
            {
              startDate: "2026-10-11",
              endDate: "2026-10-11",
              quantity: 3,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(first.ok, true);
  const before = itemLines(contractId, naId);
  assert.equal(before.length, 2);
  const keptBefore = itemLines(contractId, keptId);
  assert.equal(keptBefore.length, 1);

  const dropped = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate,
      testingEdited: false,
      handoverDate,
      handoverEdited: false,
      items: [
        {
          boqItemId: naId,
          supplies: [
            {
              startDate: SCHEDULE_DATE_NA,
              endDate: SCHEDULE_DATE_NA,
              quantity: 0,
              edited: true,
            },
          ],
          installations: [
            {
              startDate: "2026-10-18",
              endDate: "2026-10-19",
              quantity: 6,
              edited: false,
            },
          ],
        },
        {
          boqItemId: keptId,
          supplies: [
            {
              startDate: "2026-10-11",
              endDate: "2026-10-11",
              quantity: 3,
              edited: false,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(dropped.ok, true);
  assert.equal(itemLines(contractId, naId).length, 0);
  for (const line of before) {
    assert.equal(
      getData().schedules.some((s) => s.id === line.id),
      false
    );
  }
  const kept = itemLines(contractId, keptId);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.id, keptBefore[0]?.id);
  assert.equal(kept[0]?.quantity, 3);
  assert.equal(
    getData().schedules.find(
      (s) => s.contractId === contractId && s.kind === "testing"
    )?.startDate,
    testingDate
  );
  assert.equal(
    getData().schedules.find(
      (s) => s.contractId === contractId && s.kind === "handover"
    )?.startDate,
    handoverDate
  );
});

function linesFor(contractId: string) {
  return getData().schedules.filter((s) => s.contractId === contractId);
}

test("confirming a date slip leaves NA testing and handover as NA", () => {
  const firstId = "boq-slip-first";
  const laterId = "boq-slip-later";
  const created = addScheduleContract("C-NA-SLIP", [
    { id: firstId, name: "First item", quantity: 4 },
    { id: laterId, name: "Later item", quantity: 2 },
  ]);
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: SCHEDULE_DATE_NA,
      handoverDate: SCHEDULE_DATE_NA,
      items: [
        {
          boqItemId: firstId,
          supplies: [
            {
              startDate: "2026-10-01",
              endDate: "2026-10-02",
              quantity: 4,
            },
          ],
          installations: [
            {
              startDate: "2026-10-10",
              endDate: "2026-10-12",
              quantity: 4,
            },
          ],
        },
        {
          boqItemId: laterId,
          supplies: [
            {
              startDate: "2026-10-20",
              endDate: "2026-10-21",
              quantity: 2,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, true);
  const install = linesFor(contractId).find((s) => s.kind === "installation");
  const testing = linesFor(contractId).find((s) => s.kind === "testing");
  const handover = linesFor(contractId).find((s) => s.kind === "handover");
  const later = linesFor(contractId).find((s) => s.boqItemId === laterId);
  assert.ok(install && testing && handover && later);

  const slipped = updateSchedule(
    install.id,
    { endDate: "2026-10-17" },
    { by: "Tester" }
  );
  assert.equal(slipped.ok, true);
  if (!slipped.ok) return;
  const cascade = slipped.cascade ?? [];
  assert.equal(
    cascade.some((p) => p.scheduleId === testing.id),
    false
  );
  assert.equal(
    cascade.some((p) => p.scheduleId === handover.id),
    false
  );
  assert.equal(
    cascade.some((p) => p.scheduleId === later.id),
    true
  );
  for (const proposal of cascade) {
    assert.equal(proposal.startDate.includes("NaN"), false);
    assert.equal(proposal.endDate.includes("NaN"), false);
  }
  const confirmed = applyCascadeProposals(cascade, {
    by: "Tester",
    contractId,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(
    linesFor(contractId).find((s) => s.id === testing.id)?.startDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === testing.id)?.endDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === handover.id)?.startDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === later.id)?.startDate,
    "2026-10-25"
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === later.id)?.endDate,
    "2026-10-26"
  );
  assert.equal(
    linesFor(contractId).some(
      (s) => s.startDate.includes("NaN") || s.endDate.includes("NaN")
    ),
    false
  );

  const logBefore = getData().scheduleChangeLog.length;
  const forced = applyCascadeProposals(
    [
      {
        scheduleId: testing.id,
        label: "Testing",
        fromStartDate: SCHEDULE_DATE_NA,
        fromEndDate: SCHEDULE_DATE_NA,
        startDate: "NaN-NaN-NaN",
        endDate: "NaN-NaN-NaN",
      },
    ],
    { by: "Tester", contractId }
  );
  assert.equal(forced.ok, true);
  assert.equal(
    linesFor(contractId).find((s) => s.id === testing.id)?.startDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === testing.id)?.endDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(getData().scheduleChangeLog.length, logBefore);
});

test("a real handover still slips when testing is NA", () => {
  const boqId = "boq-slip-real-ho";
  const created = addScheduleContract("C-NA-SLIP-HO", [
    { id: boqId, name: "Slipped item", quantity: 2 },
  ]);
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: SCHEDULE_DATE_NA,
      handoverDate: "2026-11-01",
      items: [
        {
          boqItemId: boqId,
          supplies: [
            {
              startDate: "2026-10-01",
              endDate: "2026-10-02",
              quantity: 2,
            },
          ],
          installations: [
            {
              startDate: "2026-10-10",
              endDate: "2026-10-12",
              quantity: 2,
            },
          ],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, true);
  const install = linesFor(contractId).find((s) => s.kind === "installation");
  const testing = linesFor(contractId).find((s) => s.kind === "testing");
  const handover = linesFor(contractId).find((s) => s.kind === "handover");
  assert.ok(install && testing && handover);
  const slipped = updateSchedule(
    install.id,
    { endDate: "2026-10-15" },
    { by: "Tester" }
  );
  assert.equal(slipped.ok, true);
  if (!slipped.ok) return;
  const cascade = slipped.cascade ?? [];
  assert.equal(
    cascade.some((p) => p.scheduleId === testing.id),
    false
  );
  const handoverProposal = cascade.find((p) => p.scheduleId === handover.id);
  assert.ok(handoverProposal);
  assert.equal(handoverProposal.startDate, "2026-11-04");
  assert.equal(handoverProposal.endDate, "2026-11-04");
  const confirmed = applyCascadeProposals(cascade, {
    by: "Tester",
    contractId,
  });
  assert.equal(confirmed.ok, true);
  assert.equal(
    linesFor(contractId).find((s) => s.id === testing.id)?.startDate,
    SCHEDULE_DATE_NA
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === handover.id)?.startDate,
    "2026-11-04"
  );
  assert.equal(
    linesFor(contractId).find((s) => s.id === handover.id)?.endDate,
    "2026-11-04"
  );
});

test("setting a supply or installation start to NA removes that line", () => {
  const supplyId = "boq-edit-na-supply";
  const installId = "boq-edit-na-install";
  const keptId = "boq-edit-na-kept";
  const created = addScheduleContract("C-NA-EDIT-LINE", [
    { id: supplyId, name: "Supply line", quantity: 5 },
    { id: installId, name: "Install line", quantity: 3 },
    { id: keptId, name: "Kept line", quantity: 2 },
  ]);
  const contractId = created.contract.id;
  const saved = saveContractSchedulePlan(
    {
      contractId,
      committed: false,
      testingDate: "2026-11-20",
      handoverDate: "2026-12-01",
      items: [
        {
          boqItemId: supplyId,
          supplies: [
            {
              startDate: "2026-10-05",
              endDate: "2026-10-06",
              quantity: 5,
            },
          ],
          installations: [
            {
              startDate: "2026-10-08",
              endDate: "2026-10-09",
              quantity: 5,
            },
          ],
        },
        {
          boqItemId: installId,
          supplies: [
            {
              startDate: "2026-10-07",
              endDate: "2026-10-07",
              quantity: 3,
            },
          ],
          installations: [
            {
              startDate: "2026-10-15",
              endDate: "2026-10-16",
              quantity: 3,
            },
          ],
        },
        {
          boqItemId: keptId,
          supplies: [
            {
              startDate: "2026-10-09",
              endDate: "2026-10-09",
              quantity: 2,
            },
          ],
          installations: [],
        },
      ],
    },
    { by: "Tester" }
  );
  assert.equal(saved.ok, true);
  const supply = itemLines(contractId, supplyId).find((s) => s.kind === "supply");
  const supplyInstall = itemLines(contractId, supplyId).find(
    (s) => s.kind === "installation"
  );
  const install = itemLines(contractId, installId).find(
    (s) => s.kind === "installation"
  );
  const kept = itemLines(contractId, keptId)[0];
  const handover = linesFor(contractId).find((s) => s.kind === "handover");
  assert.ok(supply && supplyInstall && install && kept && handover);

  const droppedSupply = updateSchedule(
    supply.id,
    {
      startDate: SCHEDULE_DATE_NA,
      endDate: SCHEDULE_DATE_NA,
      quantity: 0,
    },
    { by: "Tester" }
  );
  assert.equal(droppedSupply.ok, true);
  assert.equal(
    getData().schedules.some((s) => s.id === supply.id),
    false
  );
  assert.equal(
    getData().schedules.some((s) => s.id === supplyInstall.id),
    true
  );

  const droppedInstall = updateSchedule(
    install.id,
    {
      startDate: "NA",
      endDate: "NA",
      quantity: null,
    },
    { by: "Tester" }
  );
  assert.equal(droppedInstall.ok, true);
  assert.equal(
    getData().schedules.some((s) => s.id === install.id),
    false
  );
  assert.equal(
    itemLines(contractId, installId).some((s) => s.kind === "supply"),
    true
  );
  assert.equal(
    getData().schedules.find((s) => s.id === kept.id)?.quantity,
    2
  );

  const handoverNa = updateSchedule(
    handover.id,
    { startDate: SCHEDULE_DATE_NA, endDate: SCHEDULE_DATE_NA },
    { by: "Tester" }
  );
  assert.equal(handoverNa.ok, true);
  const storedHandover = getData().schedules.find((s) => s.id === handover.id);
  assert.ok(storedHandover);
  assert.equal(storedHandover.startDate, SCHEDULE_DATE_NA);
  assert.equal(storedHandover.endDate, SCHEDULE_DATE_NA);
});
