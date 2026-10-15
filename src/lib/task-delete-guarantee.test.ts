import assert from "node:assert/strict";
import test from "node:test";
import { guaranteeIdentitySaved } from "@/lib/types";
import {
  addContract,
  addSubtask,
  amendContractBoq,
  deleteSubtask,
  deleteTask,
  getData,
  syncDatedSystemTasks,
  taskIsOpen,
  taskVisibleInLists,
  updateContract,
} from "@/lib/store";

function shiftIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function makeContract(tag: string, extra?: { abg?: boolean; pbg?: boolean }) {
  return addContract({
    projectName: tag,
    projectNo: tag,
    orderNos: tag,
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 100000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: extra?.abg ?? false,
    abgPercent: extra?.abg ? 10 : null,
    abgValue: null,
    pbgRequired: extra?.pbg ?? false,
    pbgPercent: extra?.pbg ? 5 : null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [
      {
        id: `boq-${tag}`,
        catalogKey: `item-${tag}`,
        name: tag,
        unit: "Nos",
        rate: 100000,
        quantity: 1,
      },
    ],
  });
}

test("guarantee identity is number, creation date, and bank", () => {
  assert.equal(guaranteeIdentitySaved("ABG-1", "2026-01-02", "HDFC"), true);
  assert.equal(guaranteeIdentitySaved("ABG-1", "2026-01-02", "  "), false);
  assert.equal(guaranteeIdentitySaved("ABG-1", null, "HDFC"), false);
  assert.equal(guaranteeIdentitySaved(null, null, null), false);
});

test("a saved guarantee amount is not rewritten from the percent", () => {
  const { contract } = makeContract("AMT-KEEP", { abg: true, pbg: true });
  assert.equal(contract.abgValue, 10000);
  assert.equal(contract.pbgValue, 5000);

  const custom = updateContract(contract.id, { abgValue: 43210, pbgValue: 1111 });
  assert.equal(custom?.abgValue, 43210);
  assert.equal(custom?.pbgValue, 1111);

  const valued = updateContract(contract.id, { orderValue: 250000 });
  assert.equal(valued?.orderValue, 250000);
  assert.equal(valued?.abgValue, 43210);
  assert.equal(valued?.pbgValue, 1111);
  assert.equal(valued?.abgPercent, 10);

  const bank = updateContract(contract.id, { abgBankName: "SBI" });
  assert.equal(bank?.abgValue, 43210);

  const locked = updateContract(contract.id, {
    abgRetrieved: true,
    abgRetrievedDate: "2026-10-01",
    abgValue: 1,
  });
  assert.equal(locked?.abgRetrieved, true);
  assert.equal(locked?.abgValue, 43210);

  const amended = amendContractBoq({
    contractId: contract.id,
    boq: [
      {
        id: `boq-AMT-KEEP`,
        catalogKey: `item-AMT-KEEP`,
        name: "AMT-KEEP",
        unit: "Nos",
        rate: 200000,
        quantity: 1,
      },
    ],
    newOrderValue: 200000,
    date: "2026-10-15",
  });
  assert.equal(amended.ok, true);
  if (!amended.ok) return;
  assert.equal(amended.contract.orderValue, 200000);
  assert.equal(amended.contract.abgValue, 43210);
  assert.equal(amended.contract.pbgValue, 1111);
});

test("marking a guarantee not required closes create and expiry tasks", () => {
  const { contract, tasks } = makeContract("ABG-OFF", { abg: true, pbg: true });
  assert.ok(tasks.some((t) => t.catalogKey === "create_abg" && taskIsOpen(t)));
  const expiry = shiftIso(30);
  const withExpiry = updateContract(contract.id, {
    abgExpiry: expiry,
    pbgExpiry: expiry,
  });
  assert.equal(withExpiry?.abgRequired, true);
  const openChase = getData().tasks.filter(
    (t) => t.contractId === contract.id && t.catalogKey === "bg_expiry_abg" && taskIsOpen(t)
  );
  assert.equal(openChase.length, 1);

  const cleared = updateContract(contract.id, { abgRequired: false });
  assert.equal(cleared?.abgRequired, false);
  assert.equal(cleared?.pbgRequired, true);
  const rows = getData().tasks.filter((t) => t.contractId === contract.id);
  const create = rows.find((t) => t.catalogKey === "create_abg");
  const chase = rows.find((t) => t.catalogKey === "bg_expiry_abg");
  assert.equal(create?.status, "not_required");
  assert.equal(chase?.status, "not_required");
  assert.equal(taskIsOpen(create!), false);
  assert.equal(
    rows.some((t) => t.catalogKey === "create_pbg" && taskIsOpen(t)),
    true
  );

  syncDatedSystemTasks();
  const after = getData().tasks.filter(
    (t) => t.contractId === contract.id && t.catalogKey === "bg_expiry_abg" && taskIsOpen(t)
  );
  assert.equal(after.length, 0);
});

test("a guarantee cannot be cleared once number, date, and bank are saved", () => {
  const { contract } = makeContract("ABG-LOCK", { abg: true });
  updateContract(contract.id, {
    abgNumber: "ABG/1",
    abgDate: "2026-02-01",
    abgBankName: "HDFC",
  });
  const blocked = updateContract(contract.id, { abgRequired: false });
  assert.equal(blocked?.abgRequired, true);
  const create = getData().tasks.find(
    (t) => t.contractId === contract.id && t.catalogKey === "create_abg"
  );
  assert.equal(create?.status, "pending");
});

test("deleting a task hides it and its subtasks and blocks expiry sync", () => {
  const { contract } = makeContract("DEL-TASK", { abg: true });
  const parent = getData().tasks.find(
    (t) => t.contractId === contract.id && t.catalogKey === "create_abg"
  );
  assert.ok(parent);
  const sub = addSubtask(parent!.id, { title: "Collect papers" });
  assert.ok(sub);
  assert.equal(deleteSubtask(sub!.id), true);
  assert.equal(taskVisibleInLists(getData().tasks.find((t) => t.id === sub!.id)!), false);
  assert.equal(taskIsOpen(parent!), true);
  assert.ok(getData().tasks.some((t) => t.id === sub!.id));

  const expiry = shiftIso(40);
  updateContract(contract.id, {
    abgNumber: "ABG/9",
    abgDate: "2026-03-01",
    abgExpiry: expiry,
    abgBankName: "ICICI",
  });
  const chase = getData().tasks.find(
    (t) => t.contractId === contract.id && t.catalogKey === "bg_expiry_abg" && !t.deletedAt
  );
  assert.ok(chase);
  assert.equal(deleteTask(chase!.id), true);
  const hidden = getData().tasks.find((t) => t.id === chase!.id);
  assert.ok(hidden?.deletedAt);
  assert.equal(taskVisibleInLists(hidden!), false);
  assert.equal(taskIsOpen(hidden!), false);

  updateContract(contract.id, { abgExpiry: shiftIso(50) });
  syncDatedSystemTasks();
  const chases = getData().tasks.filter(
    (t) => t.contractId === contract.id && t.catalogKey === "bg_expiry_abg"
  );
  assert.equal(chases.length, 1);
  assert.ok(chases[0]?.deletedAt);
  assert.equal(
    getData().tasks.some(
      (t) => t.contractId === contract.id && t.catalogKey === "bg_expiry_abg" && taskIsOpen(t)
    ),
    false
  );
});

test("deleting a parent task hides its subtasks from lists", () => {
  const { contract } = makeContract("DEL-PARENT", { abg: true });
  const parent = getData().tasks.find(
    (t) => t.contractId === contract.id && t.catalogKey === "create_abg"
  );
  const sub = addSubtask(parent!.id, { title: "File copy" });
  assert.equal(deleteTask(parent!.id), true);
  const data = getData();
  const storedParent = data.tasks.find((t) => t.id === parent!.id);
  const storedSub = data.tasks.find((t) => t.id === sub!.id);
  assert.ok(storedParent?.deletedAt);
  assert.ok(storedSub?.deletedAt);
  assert.equal(taskVisibleInLists(storedParent!), false);
  assert.equal(taskVisibleInLists(storedSub!), false);
  assert.equal(taskIsOpen(storedParent!), false);
  assert.equal(taskIsOpen(storedSub!), false);
});
