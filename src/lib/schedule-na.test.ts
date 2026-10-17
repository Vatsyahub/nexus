import assert from "node:assert/strict";
import test from "node:test";
import { addContract, getData, saveContractSchedulePlan } from "@/lib/store";
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
