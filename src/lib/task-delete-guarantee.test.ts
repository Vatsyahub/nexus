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
        rate: 100000,
        quantity: 2,
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

function openTasks(contractId: string, catalogKey: string) {
  return getData().tasks.filter(
    (t) => t.contractId === contractId && t.catalogKey === catalogKey && taskIsOpen(t)
  );
}

test("adding a guarantee on a not-required contract stores the typed amount", () => {
  const { contract, tasks } = makeContract("ABG-LATER");
  assert.equal(contract.abgRequired, false);
  assert.equal(contract.pbgRequired, false);
  assert.equal(contract.abgValue, null);
  assert.equal(contract.pbgValue, null);
  assert.equal(
    tasks.some((t) => t.catalogKey === "create_abg" || t.catalogKey === "create_pbg"),
    false
  );

  const saved = updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: 900,
  });
  assert.equal(saved?.abgRequired, true);
  assert.equal(saved?.pbgRequired, true);
  assert.equal(saved?.abgPercent, 10);
  assert.equal(saved?.pbgPercent, 5);
  assert.equal(saved?.abgValue, 2500);
  assert.equal(saved?.pbgValue, 900);
  const stored = getData().contracts.find((c) => c.id === contract.id);
  assert.equal(stored?.abgValue, 2500);
  assert.equal(stored?.pbgValue, 900);

  const kept = updateContract(contract.id, { orderValue: 400000 });
  assert.equal(kept?.orderValue, 400000);
  assert.equal(kept?.abgValue, 2500);
  assert.equal(kept?.pbgValue, 900);
  assert.equal(kept?.abgPercent, 10);
  assert.equal(kept?.pbgPercent, 5);
});

test("a contract with no advance term can still gain an ABG", () => {
  const { contract } = makeContract("ABG-NO-ADV");
  assert.equal(contract.billingTerms.advance, undefined);
  assert.equal(contract.billingTerms.supply, 100);

  const saved = updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
  });
  assert.equal(saved?.abgRequired, true);
  assert.equal(saved?.abgPercent, 10);
  assert.equal(saved?.abgValue, 2500);
  assert.equal(saved?.billingTerms.advance, undefined);
});

test("a complete number, date, and expiry save leaves no open Create task", () => {
  const { contract } = makeContract("ABG-FULL");
  const expiry = shiftIso(30);
  const saved = updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
    abgNumber: "ABG/FULL",
    abgDate: "2026-04-01",
    abgExpiry: expiry,
    abgBankName: "SBI",
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: 900,
    pbgNumber: "PBG/FULL",
    pbgDate: "2026-04-02",
    pbgExpiry: expiry,
    pbgBankName: "HDFC",
  });
  assert.equal(saved?.abgRequired, true);
  assert.equal(saved?.pbgRequired, true);
  assert.equal(saved?.abgValue, 2500);
  assert.equal(saved?.pbgValue, 900);
  assert.equal(openTasks(contract.id, "create_abg").length, 0);
  assert.equal(openTasks(contract.id, "create_pbg").length, 0);
  assert.equal(openTasks(contract.id, "bg_expiry_abg").length, 1);
  assert.equal(openTasks(contract.id, "bg_expiry_pbg").length, 1);
});

test("an incomplete required save opens the Create task", () => {
  const { contract } = makeContract("ABG-OPEN");
  const saved = updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: 900,
    pbgDate: "2026-05-01",
  });
  assert.equal(saved?.abgValue, 2500);
  assert.equal(saved?.pbgValue, 900);
  const abg = openTasks(contract.id, "create_abg");
  const pbg = openTasks(contract.id, "create_pbg");
  assert.equal(abg.length, 1);
  assert.equal(pbg.length, 1);
  assert.equal(abg[0]?.title, `Create ABG — ${contract.projectNo}`);
  assert.equal(pbg[0]?.title, `Create PBG — ${contract.projectNo}`);
  assert.equal(abg[0]?.source, "system");
  assert.equal(abg[0]?.status, "pending");
  assert.equal(pbg[0]?.status, "pending");

  updateContract(contract.id, { abgBankName: "SBI" });
  assert.equal(openTasks(contract.id, "create_abg").length, 1);

  const expiry = shiftIso(40);
  const done = updateContract(contract.id, {
    abgNumber: "ABG/OPEN",
    abgDate: "2026-05-02",
    abgExpiry: expiry,
    pbgNumber: "PBG/OPEN",
    pbgExpiry: expiry,
  });
  assert.equal(done?.abgValue, 2500);
  assert.equal(done?.pbgValue, 900);
  assert.equal(openTasks(contract.id, "create_abg").length, 0);
  assert.equal(openTasks(contract.id, "create_pbg").length, 0);
  const closed = getData().tasks.find(
    (t) => t.contractId === contract.id && t.catalogKey === "create_abg"
  );
  assert.equal(closed?.status, "completed");
});

test("not required is refused after number, date, and bank are saved", () => {
  const { contract } = makeContract("ABG-HELD");
  updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
    abgNumber: "ABG/HELD",
    abgDate: "2026-06-01",
    abgBankName: "ICICI",
  });
  assert.equal(openTasks(contract.id, "create_abg").length, 1);
  const blocked = updateContract(contract.id, { abgRequired: false });
  assert.equal(blocked?.abgRequired, true);
  assert.equal(blocked?.abgValue, 2500);
  assert.equal(openTasks(contract.id, "create_abg").length, 1);
});

test("not required before number, date, and bank clears the requirement and the Create task", () => {
  const { contract } = makeContract("ABG-UNDO");
  const expiry = shiftIso(30);
  const required = updateContract(contract.id, {
    abgRequired: true,
    abgPercent: 10,
    abgValue: 2500,
    abgExpiry: expiry,
    pbgRequired: true,
    pbgPercent: 5,
    pbgValue: 900,
  });
  assert.equal(required?.abgRequired, true);
  assert.equal(required?.abgValue, 2500);
  assert.equal(openTasks(contract.id, "create_abg").length, 1);
  assert.equal(openTasks(contract.id, "create_pbg").length, 1);
  assert.equal(openTasks(contract.id, "bg_expiry_abg").length, 1);

  const cleared = updateContract(contract.id, { abgRequired: false });
  assert.equal(cleared?.abgRequired, false);
  assert.equal(cleared?.pbgRequired, true);
  assert.equal(cleared?.abgValue, 2500);
  const rows = getData().tasks.filter((t) => t.contractId === contract.id);
  assert.equal(rows.find((t) => t.catalogKey === "create_abg")?.status, "not_required");
  assert.equal(rows.find((t) => t.catalogKey === "bg_expiry_abg")?.status, "not_required");
  assert.equal(openTasks(contract.id, "create_abg").length, 0);
  assert.equal(openTasks(contract.id, "bg_expiry_abg").length, 0);
  assert.equal(openTasks(contract.id, "create_pbg").length, 1);

  syncDatedSystemTasks();
  assert.equal(openTasks(contract.id, "bg_expiry_abg").length, 0);
  assert.equal(openTasks(contract.id, "create_abg").length, 0);
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
