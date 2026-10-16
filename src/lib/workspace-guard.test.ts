import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccess, type AccessMap } from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";
import {
  EMPTY_NEXUS_COSTS,
  type Contract,
  type FlowhubData,
  type HubNotification,
  type Invoice,
  type Payment,
  type ScheduleChangeLogEntry,
  type ScheduleLine,
  type Task,
} from "@/lib/types";
import {
  mergeWorkspaceSave,
  resolveWorkspaceWrite,
  workspaceForAccount,
} from "@/lib/workspace-guard";
import { notificationVisibleForUser } from "@/lib/notification-ttl";

function access(overrides: Partial<AccessMap> = {}): AccessMap {
  return { ...defaultAccess("user"), ...overrides };
}

function file(partial: Partial<FlowhubData> = {}): FlowhubData {
  return {
    workspaceRevision: 3,
    contracts: [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    notifications: [],
    customDepartments: [],
    expenseCategories: ["Travel"],
    deliveryChallans: [],
    installationProgress: [],
    nexusCosts: {
      columns: [{ id: "col", header: "Labour" }],
      contracts: { c1: { directCost: 10, lineRates: {} } },
    },
    ...partial,
  };
}

function contract(partial: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    projectName: "Alpha",
    projectNo: "P-1",
    orderNos: "WO-1",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 5000,
    gstApplicable: true,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
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
    contractorAssigned: "Ada",
    boq: [],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function invoice(partial: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv-ti",
    type: "TI",
    number: "TI-1",
    date: "2026-02-01",
    contractId: "c1",
    lines: [],
    netAmount: 100,
    gstAmount: 18,
    extraCharges: [],
    finalAmount: 118,
    convertedFromPiId: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function payment(partial: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    contractId: "c1",
    invoiceId: "inv-ti",
    link: "TI",
    date: "2026-02-02",
    netAmount: 50,
    gstAmount: 9,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-02-02T00:00:00.000Z",
    ...partial,
  };
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts",
    assignees: [],
    status: "pending",
    dueDate: null,
    parentId: null,
    source: "manual",
    catalogKey: null,
    priority: "normal",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function schedule(partial: Partial<ScheduleLine> = {}): ScheduleLine {
  return {
    id: "s1",
    contractId: "c1",
    boqItemId: null,
    kind: "handover",
    quantity: null,
    startDate: "2026-04-01",
    endDate: "",
    committed: true,
    baselineStartDate: "",
    baselineEndDate: "",
    done: false,
    doneAt: null,
    doneBy: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...partial,
  };
}

function log(id: string, contractId: string | null = "c1"): ScheduleChangeLogEntry {
  return {
    id,
    at: "2026-10-01T00:00:00.000Z",
    by: "Ada",
    contractId,
    scheduleId: null,
    summary: id,
  };
}

function save(
  current: FlowhubData,
  incoming: FlowhubData,
  map: AccessMap,
  clearance: ClearanceRole = "user"
) {
  const currentRev = current.workspaceRevision ?? 0;
  const incomingRev = incoming.workspaceRevision ?? 0;
  const stamped =
    incomingRev > currentRev
      ? incoming
      : { ...incoming, workspaceRevision: currentRev + 1 };
  const result = resolveWorkspaceWrite(current, stamped, map, clearance);
  assert.equal(result.action, "save");
  if (result.action !== "save") throw new Error("expected save");
  return result.data;
}

test("a tasks editor cannot replace payments, contracts, or bills", () => {
  const current = file({
    contracts: [contract()],
    invoices: [invoice()],
    payments: [payment()],
    tasks: [task()],
  });
  const incoming = file({
    contracts: [contract({ projectName: "Replaced", orderValue: 1 })],
    invoices: [invoice({ number: "TI-HACK", finalAmount: 1 })],
    payments: [payment({ netAmount: 1 })],
    tasks: [task({ title: "Updated task" })],
  });
  const saved = save(
    current,
    incoming,
    access({
      contracts: "block",
      billing: "view",
      payments: "block",
      tasks: "edit",
    })
  );
  assert.equal(saved.contracts[0]?.projectName, "Alpha");
  assert.equal(saved.contracts[0]?.orderValue, 5000);
  assert.equal(saved.invoices[0]?.number, "TI-1");
  assert.equal(saved.payments[0]?.netAmount, 50);
  assert.equal(saved.tasks[0]?.title, "Updated task");
});

test("view keeps the stored copy and edit applies that slice", () => {
  const current = file({ payments: [payment({ netAmount: 50 })] });
  const incoming = file({ payments: [payment({ netAmount: 80 })] });
  const viewed = save(current, incoming, access({ payments: "view" }));
  assert.equal(viewed.payments[0]?.netAmount, 50);
  const edited = save(current, incoming, access({ payments: "edit" }));
  assert.equal(edited.payments[0]?.netAmount, 80);
});

test("expenses edit does not rewrite the rest of the contract", () => {
  const current = file({
    contracts: [
      contract({
        orderValue: 5000,
        expenses: [
          {
            id: "e1",
            amount: 10,
            date: "2026-03-01",
            personPaid: "Ada",
            reason: "Cab",
            category: "Travel",
            createdAt: "2026-03-01T00:00:00.000Z",
            createdBy: "Ada",
            editHistory: [],
            deletedAt: null,
            deletedBy: null,
          },
        ],
      }),
    ],
    expenseCategories: ["Travel"],
  });
  const incoming = file({
    contracts: [
      contract({
        orderValue: 1,
        projectName: "Hacked",
        expenses: [
          {
            id: "e1",
            amount: 99,
            date: "2026-03-02",
            personPaid: "Ada",
            reason: "Cab",
            category: "Travel",
            createdAt: "2026-03-01T00:00:00.000Z",
            createdBy: "Ada",
            editHistory: [],
            deletedAt: null,
            deletedBy: null,
          },
        ],
      }),
    ],
    expenseCategories: ["Travel", "Courier"],
  });
  const saved = save(
    current,
    incoming,
    access({ contracts: "block", expenses: "edit" })
  );
  assert.equal(saved.contracts[0]?.projectName, "Alpha");
  assert.equal(saved.contracts[0]?.orderValue, 5000);
  assert.equal(saved.contracts[0]?.expenses[0]?.amount, 99);
  assert.deepEqual(saved.expenseCategories, ["Travel", "Courier"]);
});

test("contracts edit without expenses edit keeps stored expenses", () => {
  const current = file({
    contracts: [
      contract({
        expenses: [
          {
            id: "e1",
            amount: 10,
            date: "2026-03-01",
            personPaid: "Ada",
            reason: "Cab",
            category: "Travel",
            createdAt: "2026-03-01T00:00:00.000Z",
            createdBy: "Ada",
            editHistory: [],
            deletedAt: null,
            deletedBy: null,
          },
        ],
      }),
    ],
  });
  const incoming = file({
    contracts: [contract({ projectName: "Renamed", expenses: [] })],
  });
  const saved = save(
    current,
    incoming,
    access({ contracts: "edit", expenses: "view" })
  );
  assert.equal(saved.contracts[0]?.projectName, "Renamed");
  assert.equal(saved.contracts[0]?.expenses[0]?.amount, 10);
});

test("a non-master edit cannot delete a contract or a tax invoice", () => {
  const kept = contract({
    boq: [
      {
        id: "b1",
        catalogKey: "bolt",
        name: "Bolt",
        unit: "Nos",
        rate: 5,
        quantity: 1,
      },
    ],
  });
  const other = contract({ id: "c2", projectNo: "P-2", projectName: "Beta" });
  const current = file({
    contracts: [kept, other],
    invoices: [invoice(), invoice({ id: "pi-1", type: "PI", number: "PI-1" })],
    payments: [payment()],
    tasks: [task()],
    itemCatalog: [{ key: "bolt", name: "Bolt", unit: "Nos", lastRate: 5 }],
  });
  const deletedContract = file({
    contracts: [other],
    invoices: [],
    payments: [],
    tasks: [],
    itemCatalog: [],
  });
  const saved = save(current, deletedContract, access(), "user");
  assert.ok(saved.contracts.some((c) => c.id === "c1"));
  assert.equal(saved.invoices.find((i) => i.id === "inv-ti")?.number, "TI-1");
  assert.equal(saved.payments[0]?.invoiceId, "inv-ti");
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.itemCatalog[0]?.key, "bolt");

  const droppedBills = file({
    contracts: [kept, other],
    invoices: [],
    payments: [payment({ invoiceId: null, link: "unlinked" })],
    tasks: [task()],
    itemCatalog: current.itemCatalog,
  });
  const bills = save(current, droppedBills, access(), "user");
  assert.equal(bills.invoices.find((i) => i.id === "inv-ti")?.type, "TI");
  assert.equal(bills.payments[0]?.link, "TI");
  assert.equal(bills.invoices.find((i) => i.id === "pi-1"), undefined);
});

test("a non-master cannot delete a task or mark it deleted", () => {
  const current = file({
    tasks: [task(), task({ id: "task-2", title: "Keep me", parentId: "task-1" })],
  });
  const dropped = file({ tasks: [] });
  const saved = save(current, dropped, access({ tasks: "edit" }), "user");
  assert.equal(saved.tasks.length, 2);
  assert.equal(saved.tasks.find((t) => t.id === "task-1")?.title, "Check site");

  const marked = file({
    tasks: [
      task({ deletedAt: "2026-10-15T00:00:00.000Z", title: "Edited" }),
      task({ id: "task-2", title: "Keep me", parentId: "task-1" }),
    ],
  });
  const kept = save(current, marked, access({ tasks: "edit" }), "manager");
  assert.equal(kept.tasks.find((t) => t.id === "task-1")?.deletedAt ?? null, null);
  assert.equal(kept.tasks.find((t) => t.id === "task-1")?.title, "Edited");
});

test("master can hide a task with the delete mark", () => {
  const current = file({ tasks: [task()] });
  const incoming = file({
    tasks: [task({ deletedAt: "2026-10-15T00:00:00.000Z" })],
    workspaceRevision: 4,
  });
  const saved = save(current, incoming, access({ tasks: "edit" }), "master");
  assert.equal(saved.tasks[0]?.deletedAt, "2026-10-15T00:00:00.000Z");
  assert.equal(saved.tasks.length, 1);
});

test("master can delete a contract and a tax invoice", () => {
  const current = file({
    contracts: [contract()],
    invoices: [invoice()],
    payments: [payment()],
  });
  const incoming = file({
    contracts: [],
    invoices: [],
    payments: [],
    workspaceRevision: 4,
  });
  const saved = save(current, incoming, access(), "master");
  assert.equal(saved.contracts.length, 0);
  assert.equal(saved.invoices.length, 0);
});

test("clearing the whole schedule change log is master-only", () => {
  const current = file({
    schedules: [schedule()],
    scheduleChangeLog: [log("row-1"), log("row-2")],
  });
  const incoming = file({
    schedules: current.schedules,
    scheduleChangeLog: [],
  });
  const kept = save(current, incoming, access({ schedules: "edit" }), "director");
  assert.equal(kept.scheduleChangeLog.length, 2);
  const cleared = save(current, incoming, access({ schedules: "edit" }), "master");
  assert.equal(cleared.scheduleChangeLog.length, 0);
  const appended = save(
    current,
    file({
      schedules: current.schedules,
      scheduleChangeLog: [...current.scheduleChangeLog, log("row-3")],
    }),
    access({ schedules: "edit" }),
    "user"
  );
  assert.equal(appended.scheduleChangeLog.length, 3);
});

test("nexus core follows its own door", () => {
  const current = file();
  const incoming = file({ nexusCosts: EMPTY_NEXUS_COSTS });
  const kept = save(current, incoming, access({ nexus_core: "block" }));
  assert.equal(kept.nexusCosts?.contracts.c1?.directCost, 10);
  const cleared = save(current, incoming, access({ nexus_core: "edit" }));
  assert.equal(cleared.nexusCosts?.columns.length, 0);
  assert.equal(cleared.contracts.length, 0);
});

test("an equal or older revision is refused and a newer revision is stored", () => {
  const current = file({
    contracts: [contract({ abgNumber: "ABG/SERVER/1", pbgNumber: "PBG/SERVER/1" })],
    workspaceRevision: 4,
  });
  const equal = resolveWorkspaceWrite(
    current,
    file({
      contracts: [contract({ abgNumber: "ABG/STALE/1", pbgNumber: "PBG/STALE/1" })],
      workspaceRevision: 4,
    }),
    access(),
    "master"
  );
  assert.equal(equal.action, "skip");
  if (equal.action === "skip") {
    assert.equal(equal.skipped, "refuse-stale-revision");
    assert.equal(equal.incomingRevision, 4);
  }
  const older = resolveWorkspaceWrite(
    current,
    file({
      contracts: [contract({ abgNumber: "ABG/OLDER/1" })],
      workspaceRevision: 2,
    }),
    access(),
    "master"
  );
  assert.equal(older.action, "skip");
  if (older.action === "skip") assert.equal(older.skipped, "refuse-stale-revision");
  const newer = resolveWorkspaceWrite(
    current,
    file({
      contracts: [
        contract({ abgNumber: "ABG/NEW/1", pbgNumber: "PBG/NEW/1" }),
      ],
      workspaceRevision: 5,
    }),
    access(),
    "master"
  );
  assert.equal(newer.action, "save");
  if (newer.action !== "save") return;
  assert.equal(newer.data.workspaceRevision, 5);
  assert.equal(newer.data.contracts[0]?.abgNumber, "ABG/NEW/1");
  assert.equal(newer.data.contracts[0]?.pbgNumber, "PBG/NEW/1");
  const intentional = resolveWorkspaceWrite(
    current,
    file({ workspaceRevision: 5 }),
    access(),
    "master"
  );
  assert.equal(intentional.action, "save");
});

test("a blocked door is omitted unless its report is open", () => {
  const stored = file({
    contracts: [contract({ orderValue: 9000 })],
    invoices: [invoice()],
    payments: [payment()],
    tasks: [task()],
    schedules: [schedule()],
    scheduleChangeLog: [log("row-1")],
    itemCatalog: [{ key: "bolt", name: "Bolt", unit: "Nos", lastRate: 5 }],
  });
  stored.contracts[0] = contract({
    orderValue: 9000,
    expenses: [
      {
        id: "e1",
        amount: 40,
        date: "2026-03-01",
        personPaid: "Ada",
        reason: "Cab",
        category: "Travel",
        createdAt: "2026-03-01T00:00:00.000Z",
        createdBy: "Ada",
        editHistory: [],
        deletedAt: null,
        deletedBy: null,
      },
    ],
  });

  const blocked = access({
    contracts: "block",
    billing: "block",
    payments: "block",
    tasks: "block",
    schedules: "block",
    expenses: "block",
    nexus_core: "block",
    reports_outstanding: "block",
    reports_sales: "block",
    reports_accounts: "block",
    reports_reconciliation: "block",
    reports_operations: "block",
    reports_other: "block",
  });
  const hidden = workspaceForAccount(stored, blocked);
  assert.equal(hidden.contracts.length, 0);
  assert.equal(hidden.invoices.length, 0);
  assert.equal(hidden.payments.length, 0);
  assert.equal(hidden.tasks.length, 0);
  assert.equal(hidden.schedules.length, 0);
  assert.equal(hidden.scheduleChangeLog.length, 0);
  assert.equal(hidden.expenseCategories.length, 0);
  assert.equal(hidden.itemCatalog.length, 0);
  assert.equal(hidden.nexusCosts?.columns.length, 0);

  const sales = workspaceForAccount(stored, {
    ...blocked,
    reports_sales: "view",
  });
  assert.equal(sales.contracts.length, 1);
  assert.equal(sales.contracts[0]?.orderValue, 9000);
  assert.equal(sales.invoices.length, 1);
  assert.equal(sales.payments.length, 1);
  assert.equal(sales.tasks.length, 0);
  assert.equal(sales.scheduleChangeLog.length, 0);

  const operations = workspaceForAccount(stored, {
    ...blocked,
    reports_operations: "view",
  });
  assert.equal(operations.schedules.length, 1);
  assert.equal(operations.scheduleChangeLog.length, 0);
  assert.equal(operations.invoices.length, 0);

  const expensesOnly = workspaceForAccount(stored, {
    ...blocked,
    expenses: "view",
  });
  assert.equal(expensesOnly.contracts.length, 1);
  assert.equal(expensesOnly.contracts[0]?.orderValue, 0);
  assert.equal(expensesOnly.contracts[0]?.expenses[0]?.amount, 40);
  assert.deepEqual(expensesOnly.expenseCategories, ["Travel"]);
  assert.equal(expensesOnly.itemCatalog.length, 0);

  const viewSchedules = workspaceForAccount(stored, {
    ...blocked,
    schedules: "view",
  });
  assert.equal(viewSchedules.schedules.length, 1);
  assert.equal(viewSchedules.scheduleChangeLog.length, 1);
});

function notice(partial: Partial<HubNotification>): HubNotification {
  return {
    id: "shared",
    createdAt: new Date().toISOString(),
    kind: "task_assigned",
    title: "Task assigned to you",
    body: "Check drawings",
    href: "/tasks",
    taskId: "task-1",
    contractId: "contract-1",
    audienceUserNames: ["Alice", "Bob"],
    audienceDepartment: null,
    createdBy: null,
    readByUserIds: ["alice"],
    readAtByUserIds: { alice: new Date().toISOString() },
    ...partial,
  };
}

test("merge keeps a cleared notice out of that person's box", () => {
  const clearedAt = new Date().toISOString();
  const stored = notice({ clearedByUserIds: ["alice"] });
  const current = file({
    notifications: [stored],
    clearedNotices: { shared: { alice: clearedAt } },
  });
  const incoming = file({
    notifications: [notice({ clearedByUserIds: [], readByUserIds: [] })],
    clearedNotices: {},
  });
  const merged = mergeWorkspaceSave(
    current,
    incoming,
    access({ tasks: "edit" }),
    "user"
  );
  assert.equal(merged.notifications.length, 1);
  assert.equal(merged.notifications[0]?.id, "shared");
  assert.ok(merged.notifications[0]?.clearedByUserIds?.includes("alice"));
  assert.equal(merged.clearedNotices?.shared?.alice, clearedAt);
  assert.equal(
    notificationVisibleForUser(merged.notifications[0]!, "alice"),
    false
  );
  assert.equal(
    notificationVisibleForUser(merged.notifications[0]!, "bob"),
    true
  );
});

test("merge ignores anything but the account doors", () => {
  const current = file({ tasks: [task({ title: "Stored" })] });
  const incoming = file({ tasks: [task({ title: "Incoming" })] });
  const merged = mergeWorkspaceSave(
    current,
    incoming,
    access({ tasks: "edit", payments: "block" }),
    "user"
  );
  assert.equal(merged.tasks[0]?.title, "Incoming");
  assert.equal(merged.payments.length, 0);
});
