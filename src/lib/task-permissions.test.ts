import assert from "node:assert/strict";
import test from "node:test";
import { defaultAccess } from "@/lib/access";
import {
  applyTaskEditPolicy,
  canUpdateTask,
  coerceTaskAssignees,
  departmentChangeAllowed,
  peopleNamedInDepartment,
  resolveTaskAssignees,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import { completesImmediately } from "@/lib/task-notices";
import { EMPTY_NEXUS_COSTS, type FlowhubData, type Task } from "@/lib/types";
import { mergeWorkspaceSave } from "@/lib/workspace-guard";

const people: TaskDirectoryPerson[] = [
  { name: "Priya Manager", department: "Contracts Department", clearance: "manager" },
  { name: "Asha Accounts", department: "Accounts Department", clearance: "manager" },
  { name: "Isha Install", department: "Installation Department", clearance: "manager" },
  { name: "Anil User", department: "Drawings Department", clearance: "user" },
  { name: "New Joiner", department: "Contracts Department", clearance: "user" },
  { name: "Site Lead", department: "Installation Department", clearance: "user" },
];

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts Department",
    assignees: [],
    status: "pending",
    dueDate: null,
    parentId: null,
    source: "manual",
    catalogKey: "custom",
    priority: "normal",
    notes: "",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function file(partial: Partial<FlowhubData> = {}): FlowhubData {
  return {
    workspaceRevision: 1,
    contracts: [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    taskDeadlineChangeLog: [],
    notifications: [],
    clearedNotices: {},
    customDepartments: [],
    departmentRenames: {},
    deletedDepartments: [],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    nexusCosts: EMPTY_NEXUS_COSTS,
    ...partial,
  };
}

test("a saved department can be updated only by master, director, its manager, or a named person", () => {
  const row = task({ assignees: ["Anil User"] });
  assert.equal(
    canUpdateTask(
      { name: "Site Lead", clearance: "user", department: "Installation Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "New Joiner", clearance: "user", department: "Contracts Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "Asha Accounts", clearance: "manager", department: "Accounts Department" },
      row
    ),
    false
  );
  assert.equal(
    canUpdateTask(
      { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
      row
    ),
    true
  );
  assert.equal(
    canUpdateTask(
      { name: "Anil User", clearance: "user", department: "Drawings Department" },
      row
    ),
    true
  );
  assert.equal(
    canUpdateTask({ name: "Deepa", clearance: "director", department: null }, row),
    true
  );
  assert.equal(
    canUpdateTask({ name: "Master", clearance: "master", department: "Contracts Department" }, row),
    true
  );
});

test("an empty department can still be edited, including by someone from another department", () => {
  const row = task({ department: null, assignees: [] });
  assert.equal(
    canUpdateTask(
      { name: "Site Lead", clearance: "user", department: "Installation Department" },
      row
    ),
    true
  );
  assert.equal(departmentChangeAllowed(null, "Installation Department"), true);
  assert.equal(departmentChangeAllowed("  ", "Contracts Department"), true);
});

test("a saved department cannot be changed or cleared", () => {
  assert.equal(departmentChangeAllowed("Contracts Department", "Accounts Department"), false);
  assert.equal(departmentChangeAllowed("Contracts Department", null), false);
  assert.equal(departmentChangeAllowed("Contracts Department", "contracts department"), true);
});

test("a subtask uses its own department", () => {
  const parent = task({ id: "parent", department: "Contracts Department" });
  const sub = task({
    id: "sub",
    parentId: parent.id,
    department: "Installation Department",
    title: "Install frames",
  });
  const contractsManager = {
    name: "Priya Manager",
    clearance: "manager",
    department: "Contracts Department",
  };
  const installManager = {
    name: "Isha Install",
    clearance: "manager",
    department: "Installation Department",
  };
  assert.equal(canUpdateTask(contractsManager, parent), true);
  assert.equal(canUpdateTask(contractsManager, sub), false);
  assert.equal(canUpdateTask(installManager, sub), true);
  assert.equal(canUpdateTask(installManager, parent), false);
});

test("people offered for a task stay inside the selected department", () => {
  assert.deepEqual(
    peopleNamedInDepartment(people, "Contracts Department").map((person) => person.name),
    ["Priya Manager", "New Joiner"]
  );
  assert.deepEqual(peopleNamedInDepartment(people, null), []);
  const foreign = resolveTaskAssignees({
    currentDepartment: "Contracts Department",
    nextDepartment: "Contracts Department",
    currentAssignees: [],
    nextAssignees: ["Site Lead"],
    people,
  });
  assert.equal(foreign.ok, false);
  const allowed = resolveTaskAssignees({
    currentDepartment: "Contracts Department",
    nextDepartment: "Contracts Department",
    currentAssignees: [],
    nextAssignees: ["New Joiner"],
    people,
  });
  assert.deepEqual(allowed, { ok: true, assignees: ["New Joiner"] });
});

test("a user still waits to finish, and manager, director, and master finish immediately", () => {
  assert.equal(completesImmediately("user"), false);
  assert.equal(completesImmediately("manager"), true);
  assert.equal(completesImmediately("director"), true);
  assert.equal(completesImmediately("master"), true);
});

test("someone who cannot update a task cannot store notes, and a saved department stays", () => {
  const current = task({ notes: "keep", assignees: ["New Joiner"] });
  const incoming = task({
    notes: "changed",
    department: "Accounts Department",
    assignees: ["Site Lead"],
    priority: "urgent",
    dueDate: "2026-12-01",
    status: "completed",
    overdueNotifiedFor: "2026-10-01",
  });
  const [saved] = applyTaskEditPolicy(
    [current],
    [incoming],
    { name: "Site Lead", clearance: "user", department: "Installation Department" },
    people
  );
  assert.equal(saved?.notes, "keep");
  assert.equal(saved?.department, "Contracts Department");
  assert.deepEqual(saved?.assignees, ["New Joiner"]);
  assert.equal(saved?.priority, "normal");
  assert.equal(saved?.dueDate, null);
  assert.equal(saved?.status, "pending");
  assert.equal(saved?.overdueNotifiedFor, "2026-10-01");
});

test("master can save notes and still cannot change a saved department", () => {
  const current = task();
  const [saved] = applyTaskEditPolicy(
    [current],
    [task({ notes: "from master", department: "Accounts Department", priority: "high" })],
    { name: "Master", clearance: "master" },
    people
  );
  assert.equal(saved?.notes, "from master");
  assert.equal(saved?.priority, "high");
  assert.equal(saved?.department, "Contracts Department");
});

test("the department manager and a named person can save, and a foreign name is dropped", () => {
  const current = task({ assignees: ["Anil User"] });
  const [byManager] = applyTaskEditPolicy(
    [current],
    [task({ notes: "manager note", dueDate: "2026-11-02", assignees: ["New Joiner", "Site Lead"] })],
    { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
    people
  );
  assert.equal(byManager?.notes, "manager note");
  assert.equal(byManager?.dueDate, "2026-11-02");
  assert.deepEqual(byManager?.assignees, ["New Joiner"]);

  const [byNamed] = applyTaskEditPolicy(
    [current],
    [task({ assignees: ["Anil User"], notes: "named note", priority: "urgent" })],
    { name: "Anil User", clearance: "user", department: "Drawings Department" },
    people
  );
  assert.equal(byNamed?.notes, "named note");
  assert.equal(byNamed?.priority, "urgent");
});

test("a subtask edit follows the subtask department when both rows are saved together", () => {
  const parent = task({ id: "parent", notes: "" });
  const sub = task({
    id: "sub",
    parentId: "parent",
    department: "Installation Department",
    title: "Install frames",
    notes: "",
  });
  const saved = applyTaskEditPolicy(
    [parent, sub],
    [
      task({ id: "parent", notes: "parent note" }),
      task({
        id: "sub",
        parentId: "parent",
        department: "Contracts Department",
        title: "Install frames",
        notes: "should not stick",
      }),
    ],
    { name: "Priya Manager", clearance: "manager", department: "Contracts Department" },
    people
  );
  assert.equal(saved.find((row) => row.id === "parent")?.notes, "parent note");
  assert.equal(saved.find((row) => row.id === "sub")?.notes, "");
  assert.equal(
    saved.find((row) => row.id === "sub")?.department,
    "Installation Department"
  );
});

test("an empty department can be set once, including by master, and then stays", () => {
  const open = task({ department: null });
  const [chosen] = applyTaskEditPolicy(
    [open],
    [task({ department: "Installation Department" })],
    { name: "Site Lead", clearance: "user", department: "Quality Department" },
    people
  );
  assert.equal(chosen?.department, "Installation Department");
  const [locked] = applyTaskEditPolicy(
    [chosen!],
    [task({ department: "Accounts Department", notes: "later" })],
    { name: "Master", clearance: "master" },
    people
  );
  assert.equal(locked?.department, "Installation Department");
  assert.equal(locked?.notes, "later");
});

test("a waiting completion can be confirmed by that user’s manager without opening the rest of the task", () => {
  const waiting = task({
    status: "awaiting_verification",
    verificationDepartment: "Drawings Department",
    notes: "keep",
    assignees: ["Anil User"],
  });
  const [saved] = applyTaskEditPolicy(
    [waiting],
    [
      task({
        status: "completed",
        notes: "nope",
        department: "Drawings Department",
        completedAt: "2026-10-02T00:00:00.000Z",
        verificationDepartment: "Drawings Department",
      }),
    ],
    { name: "Drawing Manager", clearance: "manager", department: "Drawings Department" },
    people
  );
  assert.equal(saved?.status, "completed");
  assert.equal(saved?.notes, "keep");
  assert.equal(saved?.department, "Contracts Department");
  assert.equal(saved?.verificationDepartment, null);
});

test("naming someone from another department does not stick on a new task", () => {
  assert.deepEqual(
    coerceTaskAssignees({
      currentDepartment: null,
      nextDepartment: "Contracts Department",
      currentAssignees: [],
      nextAssignees: ["Site Lead", "New Joiner"],
      people,
    }),
    ["New Joiner"]
  );
});

test("workspace save keeps the edit rule and still lets a department rename through", () => {
  const current = file({
    tasks: [task({ notes: "keep" })],
  });
  const blocked = mergeWorkspaceSave(
    current,
    file({
      tasks: [task({ notes: "changed", priority: "urgent" })],
    }),
    defaultAccess("user"),
    "user",
    {
      actor: {
        name: "Site Lead",
        clearance: "user",
        department: "Installation Department",
      },
      people,
    }
  );
  assert.equal(blocked.tasks[0]?.notes, "keep");
  assert.equal(blocked.tasks[0]?.priority, "normal");

  const renamed = mergeWorkspaceSave(
    file({ tasks: [task()] }),
    file({
      tasks: [task({ department: "Commercial Department", notes: "renamed with the catalog" })],
      departmentRenames: { "Contracts Department": "Commercial Department" },
    }),
    defaultAccess("master"),
    "master",
    {
      actor: { name: "Master", clearance: "master", department: null },
      people,
    }
  );
  assert.equal(renamed.tasks[0]?.department, "Commercial Department");
  assert.equal(renamed.tasks[0]?.notes, "renamed with the catalog");
});
