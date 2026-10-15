import assert from "node:assert/strict";
import test from "node:test";
import {
  addContract,
  addDeliveryChallan,
  addInvoice,
  addManualTask,
  amendContractBoq,
  boqPlainEditIssues,
  describeBoqLineUse,
  editContractBoq,
  getData,
  saveContractSchedulePlan,
  updateContract,
} from "@/lib/store";
import { boqTotal, type BoqItem, type Contract } from "@/lib/types";

function line(
  id: string,
  name: string,
  qty: number,
  rate = 100,
  unit = "Nos"
): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase(),
    name,
    unit,
    rate,
    quantity: qty,
  };
}

function makeContract(
  projectNo: string,
  boq: BoqItem[],
  orderValue = boqTotal(boq)
): Contract {
  const created = addContract({
    projectName: projectNo,
    projectNo,
    orderNos: projectNo,
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 0,
    dlpMonths: 12,
    abgRequired: true,
    abgPercent: 10,
    abgValue: null,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: null,
    contractorAssigned: "",
    boq,
  });
  return created.contract;
}

function saved(id: string): Contract {
  const contract = getData().contracts.find((c) => c.id === id);
  assert.ok(contract);
  return contract;
}

test("plain BOQ edit updates lines and order value without an amendment or guarantee change", () => {
  const free = line("plain-free", "Free item", 2, 50, "m");
  const keep = line("plain-keep", "Keep item", 4, 100, "Nos");
  const contract = makeContract("C-PLAIN-EDIT", [free, keep]);
  assert.equal(contract.orderValue, 500);
  assert.equal(contract.abgValue, 50);
  assert.equal(contract.pbgValue, 25);
  const task = addManualTask({
    title: "Finalise BOQ amendment — C-PLAIN-EDIT",
    contractId: contract.id,
    catalogKey: "boq_amendment",
    source: "system",
  });
  const taskCount = getData().tasks.filter(
    (t) => t.contractId === contract.id
  ).length;

  const res = editContractBoq({
    contractId: contract.id,
    boq: [
      {
        ...free,
        name: "Renamed item",
        unit: "Set",
        rate: 80,
        quantity: 1,
      },
      { ...keep, rate: 90, quantity: 3 },
      line("plain-new", "Added item", 2, 25, "Kg"),
    ],
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const next = saved(contract.id);
  assert.equal(next.orderValue, boqTotal(next.boq));
  assert.equal(next.orderValue, 80 * 1 + 90 * 3 + 25 * 2);
  assert.equal(next.abgValue, 50);
  assert.equal(next.pbgValue, 25);
  assert.equal(next.abgPercent, 10);
  assert.equal(next.pbgPercent, 5);
  assert.equal(next.amendments.length, 0);
  const renamed = next.boq.find((b) => b.id === free.id);
  assert.equal(renamed?.name, "Renamed item");
  assert.equal(renamed?.unit, "Set");
  assert.equal(renamed?.rate, 80);
  assert.equal(renamed?.quantity, 1);
  assert.ok(next.boq.some((b) => b.id === "plain-new"));
  const tasks = getData().tasks.filter((t) => t.contractId === contract.id);
  assert.equal(tasks.length, taskCount);
  const open = tasks.find((t) => t.id === task.id);
  assert.equal(open?.status, "pending");
  assert.equal(open?.catalogKey, "boq_amendment");
  assert.equal(open?.completedAt, null);

  const other = makeContract("C-PLAIN-RELOAD", [line("reload-other", "Other", 1, 10)]);
  assert.ok(other.id);
  const reloaded = saved(contract.id);
  assert.equal(reloaded.orderValue, 80 * 1 + 90 * 3 + 25 * 2);
  assert.equal(reloaded.abgValue, 50);
  assert.equal(reloaded.pbgValue, 25);
  assert.equal(reloaded.amendments.length, 0);
});

test("a used line can change rate and qty below what is already billed, scheduled, or delivered", () => {
  const invoiced = line("used-inv", "Invoiced item", 10, 100);
  const scheduled = line("used-sch", "Scheduled item", 10, 40);
  const delivered = line("used-dc", "Delivered item", 10, 20);
  const spare = line("used-spare", "Spare item", 1, 10);
  const contract = makeContract("C-PLAIN-USED", [
    invoiced,
    scheduled,
    delivered,
    spare,
  ]);
  const abg = contract.abgValue;
  const pbg = contract.pbgValue;
  const invoice = addInvoice({
    type: "PI",
    number: "PI-PLAIN-USED",
    date: "2026-10-02",
    contractId: contract.id,
    lines: [
      {
        boqItemId: invoiced.id,
        itemName: invoiced.name,
        termKey: "supply",
        billedQty: 8,
        rate: 100,
        termPercent: 100,
        lineNet: 800,
      },
    ],
  });
  assert.ok(invoice);
  const schedule = saveContractSchedulePlan({
    contractId: contract.id,
    committed: false,
    testingDate: "",
    handoverDate: "",
    items: [
      {
        boqItemId: scheduled.id,
        supplies: [
          { startDate: "2026-10-03", endDate: "2026-10-04", quantity: 7 },
        ],
        installations: [],
      },
    ],
  });
  assert.equal(schedule.ok, true);
  const dc = addDeliveryChallan({
    contractId: contract.id,
    dcNo: "DC-PLAIN-USED",
    date: "2026-10-05",
    lines: [{ boqItemId: delivered.id, qty: 6 }],
  });
  assert.equal(dc.ok, true);

  assert.match(describeBoqLineUse(contract.id, invoiced.id) ?? "", /invoice/);
  assert.match(describeBoqLineUse(contract.id, scheduled.id) ?? "", /schedule/);
  assert.match(
    describeBoqLineUse(contract.id, delivered.id) ?? "",
    /delivery challan/
  );
  assert.equal(describeBoqLineUse(contract.id, spare.id), null);

  const blocked = editContractBoq({
    contractId: contract.id,
    boq: [scheduled, delivered, spare],
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.match(blocked.error, /cannot be deleted/);

  const renamed = editContractBoq({
    contractId: contract.id,
    boq: [
      { ...invoiced, name: "New name" },
      scheduled,
      delivered,
      spare,
    ],
  });
  assert.equal(renamed.ok, false);
  if (renamed.ok) return;
  assert.match(renamed.error, /name stays locked/);

  const reunit = editContractBoq({
    contractId: contract.id,
    boq: [
      invoiced,
      scheduled,
      { ...delivered, unit: "Set" },
      spare,
    ],
  });
  assert.equal(reunit.ok, false);
  if (reunit.ok) return;
  assert.match(reunit.error, /unit stays locked/);

  const edited = editContractBoq({
    contractId: contract.id,
    boq: [
      { ...invoiced, rate: 125, quantity: 1 },
      { ...scheduled, rate: 10, quantity: 2 },
      { ...delivered, rate: 15, quantity: 1 },
      spare,
    ],
  });
  assert.equal(edited.ok, true);
  const next = saved(contract.id);
  assert.equal(next.boq.find((b) => b.id === invoiced.id)?.quantity, 1);
  assert.equal(next.boq.find((b) => b.id === invoiced.id)?.rate, 125);
  assert.equal(next.boq.find((b) => b.id === invoiced.id)?.name, "Invoiced item");
  assert.equal(next.boq.find((b) => b.id === scheduled.id)?.quantity, 2);
  assert.equal(next.boq.find((b) => b.id === delivered.id)?.quantity, 1);
  assert.equal(next.boq.find((b) => b.id === delivered.id)?.unit, "Nos");
  assert.equal(next.orderValue, boqTotal(next.boq));
  assert.equal(next.abgValue, abg);
  assert.equal(next.pbgValue, pbg);
  assert.equal(next.amendments.length, 0);
  assert.equal(
    getData().invoices.find((i) => i.id === invoice?.id)?.lines[0]?.billedQty,
    8
  );

  const removed = editContractBoq({
    contractId: contract.id,
    boq: next.boq.filter((b) => b.id !== spare.id),
  });
  assert.equal(removed.ok, true);
  assert.equal(
    saved(contract.id).boq.some((b) => b.id === spare.id),
    false
  );

  const amend = amendContractBoq({
    contractId: contract.id,
    boq: saved(contract.id).boq.map((b) =>
      b.id === delivered.id ? { ...b, quantity: 1 } : b
    ),
    newOrderValue: boqTotal(
      saved(contract.id).boq.map((b) =>
        b.id === delivered.id ? { ...b, quantity: 1 } : b
      )
    ),
    date: "2026-10-06",
    number: "A-USED",
  });
  assert.equal(amend.ok, false);
  if (amend.ok) return;
  assert.match(amend.error, /dispatched\/installed/);
});

test("an amendment still records history, keeps saved guarantee amounts, and closes its task", () => {
  const item = line("amd-item", "Amendment item", 10, 100);
  const contract = makeContract("C-PLAIN-AMD", [item]);
  const task = addManualTask({
    title: "Finalise BOQ amendment — C-PLAIN-AMD",
    contractId: contract.id,
    catalogKey: "boq_amendment",
    source: "system",
  });
  const first = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...item, quantity: 20 }],
    newOrderValue: 1800,
    date: "2026-10-07",
    number: "A1",
    note: "Client letter",
    by: "Tester",
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.amendment.number, "A1");
  assert.equal(first.amendment.date, "2026-10-07");
  assert.equal(first.amendment.note, "Client letter");
  assert.equal(first.amendment.newOrderValue, 1800);
  assert.equal(first.contract.orderValue, 1800);
  assert.equal(first.contract.abgValue, 100);
  assert.equal(first.contract.pbgValue, 50);
  assert.equal(
    getData().tasks.find((t) => t.id === task.id)?.status,
    "completed"
  );

  const plain = editContractBoq({
    contractId: contract.id,
    boq: [{ ...item, quantity: 5, rate: 100 }],
  });
  assert.equal(plain.ok, true);
  const pinned = saved(contract.id);
  assert.equal(pinned.orderValue, 500);
  assert.equal(pinned.abgValue, 100);
  assert.equal(pinned.pbgValue, 50);
  assert.equal(pinned.amendments.length, 1);
  assert.equal(pinned.amendments[0]?.number, "A1");

  const again = addManualTask({
    title: "Finalise BOQ amendment — C-PLAIN-AMD again",
    contractId: contract.id,
    catalogKey: "boq_amendment",
    source: "system",
  });
  const second = amendContractBoq({
    contractId: contract.id,
    boq: [{ ...item, quantity: 8, rate: 100 }],
    newOrderValue: 800,
    date: "2026-10-08",
    number: "A2",
    by: "Tester",
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const final = saved(contract.id);
  assert.equal(final.amendments.length, 2);
  assert.equal(final.amendments[1]?.number, "A2");
  assert.equal(final.amendments[1]?.date, "2026-10-08");
  assert.equal(final.orderValue, 800);
  assert.equal(final.abgValue, 100);
  assert.equal(final.pbgValue, 50);
  assert.equal(getData().tasks.find((t) => t.id === again.id)?.status, "completed");
});

test("editing the contract order value keeps saved guarantee amounts", () => {
  const contract = makeContract("C-PLAIN-ORDER", [line("order-item", "Order item", 2, 100)]);
  const edited = editContractBoq({
    contractId: contract.id,
    boq: [line("order-item", "Order item", 1, 100)],
  });
  assert.equal(edited.ok, true);
  assert.equal(saved(contract.id).orderValue, 100);
  assert.equal(saved(contract.id).abgValue, 20);
  assert.equal(saved(contract.id).pbgValue, 10);
  const updated = updateContract(contract.id, { orderValue: 4000 });
  assert.ok(updated);
  assert.equal(updated?.orderValue, 4000);
  assert.equal(updated?.abgValue, 20);
  assert.equal(updated?.pbgValue, 10);
  assert.equal(saved(contract.id).abgValue, 20);
});

test("plain BOQ edit rejects an empty bill, duplicates, and a no-op save", () => {
  const item = line("reject-item", "Reject item", 2, 30);
  const contract = makeContract("C-PLAIN-REJECT", [item]);
  const empty = boqPlainEditIssues(contract.id, []);
  assert.ok(empty.some((issue) => /at least one line/.test(issue)));
  const dup = boqPlainEditIssues(contract.id, [
    item,
    line("reject-copy", "Reject item", 1, 30),
  ]);
  assert.ok(dup.some((issue) => /Duplicate BOQ item/.test(issue)));
  const same = editContractBoq({ contractId: contract.id, boq: [item] });
  assert.equal(same.ok, false);
  if (same.ok) return;
  assert.match(same.error, /No BOQ changes/);
  const negative = editContractBoq({
    contractId: contract.id,
    boq: [{ ...item, quantity: -1 }],
  });
  assert.equal(negative.ok, false);
});
