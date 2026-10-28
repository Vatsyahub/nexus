import assert from "node:assert/strict";
import test from "node:test";
import { decideTaskDeadline } from "@/lib/task-deadline-log";
import {
  canConfirmTaskVerification,
  managerOfDepartment,
  notificationVisibleTo,
} from "@/lib/task-notices";
import {
  applyTaskEditPolicy,
  canEditTaskSchedule,
  canUpdateTask,
  departmentsASubtaskMayTake,
  peopleNamedInDepartment,
  resolveTaskAssignees,
  resolveTaskDepartment,
  taskDepartmentControl,
} from "@/lib/task-permissions";
import type { HubNotification, Task } from "@/lib/types";
import {
  departmentsAfterRename,
  formatUserDepartments,
  resolveUserDepartments,
} from "@/lib/user-departments";

const rahul = {
  name: "Rahul V",
  clearance: "manager",
  department: "Billing",
  secondDepartment: "Contracts",
};

const people = [
  rahul,
  { name: "Billing User", department: "Billing", clearance: "user" },
  { name: "Contracts User", department: "Contracts", clearance: "user" },
];

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts",
    assignees: [],
    status: "pending",
    dueDate: "2026-11-01",
    parentId: null,
    source: "manual",
    catalogKey: "custom",
    priority: "normal",
    notes: "keep",
    notesUpdatedAt: null,
    completedAt: null,
    notRequiredReason: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function notice(
  partial: Partial<HubNotification> & Pick<HubNotification, "id">
): HubNotification {
  return {
    createdAt: "2026-11-01T00:00:00.000Z",
    kind: "task_due_today",
    title: "Task due today",
    body: "Check site",
    href: "/tasks",
    taskId: "task-1",
    contractId: "c1",
    audienceUserNames: [],
    audienceDepartment: "Contracts",
    audienceClearance: null,
    createdBy: null,
    readByUserIds: [],
    readAtByUserIds: {},
    clearedByUserIds: [],
    ...partial,
  };
}

test("a manager may store a second department without rewriting the first", () => {
  assert.deepEqual(resolveUserDepartments("MANAGER", "Billing", "Contracts"), {
    department: "Billing",
    secondDepartment: "Contracts",
  });
  assert.deepEqual(resolveUserDepartments("MANAGER", "Billing", "  "), {
    department: "Billing",
    secondDepartment: null,
  });
  const same = resolveUserDepartments("MANAGER", "Billing", " billing ");
  assert.equal(same.error, "Choose two different departments.");
  assert.equal(
    resolveUserDepartments("MANAGER", "", "Contracts").error,
    "Department is required for Users and Managers."
  );
});

test("user, director, and master keep one department and drop a second", () => {
  assert.deepEqual(resolveUserDepartments("USER", "Billing", "Contracts"), {
    department: "Billing",
    secondDepartment: null,
  });
  assert.deepEqual(resolveUserDepartments("DIRECTOR", "Billing", "Contracts"), {
    department: "Billing",
    secondDepartment: null,
  });
  assert.deepEqual(resolveUserDepartments("MASTER", "", "Contracts"), {
    department: null,
    secondDepartment: null,
  });
  assert.equal(
    resolveUserDepartments("USER", "", "Contracts").error,
    "Department is required for Users and Managers."
  );
});

test("renaming one department does not rewrite the other", () => {
  const row = { department: "Billing", secondDepartment: "Contracts" };
  assert.deepEqual(departmentsAfterRename(row, "Contracts", "Commercial"), {
    department: "Billing",
    secondDepartment: "Commercial",
  });
  assert.deepEqual(departmentsAfterRename(row, "Billing", "Invoicing"), {
    department: "Invoicing",
    secondDepartment: "Contracts",
  });
  assert.deepEqual(departmentsAfterRename(row, "Contracts", null), {
    department: "Billing",
    secondDepartment: null,
  });
  assert.deepEqual(departmentsAfterRename(row, "Accounts", null), row);
});

test("the user list shows both departments when the second is set", () => {
  assert.equal(formatUserDepartments("Billing", "Contracts"), "Billing, Contracts");
  assert.equal(formatUserDepartments("Billing", null), "Billing");
  assert.equal(formatUserDepartments(null, null), "");
});

test("either department makes this person the manager of that department", () => {
  assert.equal(managerOfDepartment(rahul, "Billing"), true);
  assert.equal(managerOfDepartment(rahul, "contracts"), true);
  assert.equal(managerOfDepartment(rahul, "Accounts"), false);
  assert.equal(
    managerOfDepartment({ ...rahul, clearance: "user" }, "Contracts"),
    false
  );
  assert.equal(
    managerOfDepartment({ ...rahul, clearance: "director" }, "Contracts"),
    false
  );
  assert.equal(
    managerOfDepartment({ ...rahul, clearance: "master" }, "Contracts"),
    false
  );
  assert.equal(canUpdateTask(rahul, { department: "Contracts", assignees: [] }), true);
  assert.equal(canUpdateTask(rahul, { department: "Billing", assignees: [] }), true);
  assert.equal(canUpdateTask(rahul, { department: "Accounts", assignees: [] }), false);
});

test("a manager's second department does not name them on that department's task", () => {
  assert.deepEqual(
    peopleNamedInDepartment(people, "Contracts").map((person) => person.name),
    ["Contracts User"]
  );
  assert.deepEqual(
    peopleNamedInDepartment(people, "Billing").map((person) => person.name),
    ["Rahul V", "Billing User"]
  );
  const named = resolveTaskAssignees({
    currentDepartment: "Contracts",
    nextDepartment: "Contracts",
    currentAssignees: [],
    nextAssignees: ["Rahul V"],
    people,
  });
  assert.equal(named.ok, false);

  const [saved] = applyTaskEditPolicy(
    [task()],
    [task({ notes: "edited", assignees: ["Rahul V"], department: "Billing" })],
    rahul,
    people
  );
  assert.equal(saved?.notes, "edited");
  assert.equal(saved?.department, "Contracts");
  assert.equal(saved?.contractId, "c1");
  assert.deepEqual(saved?.assignees, []);
});

test("a saved deadline follows either department the manager holds", () => {
  assert.equal(
    canEditTaskSchedule(rahul, { department: null, assignees: [] }),
    false
  );
  assert.equal(
    canEditTaskSchedule(rahul, { department: "Contracts", assignees: [] }),
    true
  );
  const moved = decideTaskDeadline({
    currentDue: "2026-11-01",
    nextDue: "2026-12-01",
    reason: "Contracts also",
    actor: rahul,
    task: { department: "Contracts", assignees: [] },
  });
  assert.equal(moved.ok, true);
  if (moved.ok && moved.log) assert.equal(moved.log.toDate, "2026-12-01");

  const billingOnly = { ...rahul, secondDepartment: null };
  const blocked = decideTaskDeadline({
    currentDue: "2026-11-01",
    nextDue: "2026-12-01",
    reason: "Not my department",
    actor: billingOnly,
    task: { department: "Contracts", assignees: [] },
  });
  assert.equal(blocked.ok, false);
});

test("a subtask department can be either department the manager holds", () => {
  const departments = ["Accounts", "Billing", "Contracts"];
  assert.deepEqual(departmentsASubtaskMayTake(rahul, [], departments), [
    "Billing",
    "Contracts",
  ]);
  assert.deepEqual(
    taskDepartmentControl(
      rahul,
      { parentId: "parent", department: null, assignees: [] },
      departments,
      true
    ),
    { kind: "choose", options: ["Billing", "Contracts"] }
  );
  const chosen = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: null,
    nextDepartment: "Contracts",
    assignees: [],
    actor: rahul,
  });
  assert.deepEqual(chosen, { ok: true, department: "Contracts" });
  const refused = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: null,
    nextDepartment: "Accounts",
    assignees: [],
    actor: rahul,
  });
  assert.equal(refused.ok, false);
  const cleared = resolveTaskDepartment({
    parentId: "parent",
    currentDepartment: "Contracts",
    nextDepartment: null,
    assignees: [],
    actor: rahul,
  });
  assert.deepEqual(cleared, { ok: true, department: null });
});

test("verification confirm and a due-today notice accept the second department", () => {
  assert.equal(
    canConfirmTaskVerification(rahul, {
      status: "awaiting_verification",
      verificationDepartment: "Contracts",
    }),
    true
  );
  assert.equal(
    canConfirmTaskVerification(rahul, {
      status: "awaiting_verification",
      verificationDepartment: "Accounts",
    }),
    false
  );
  assert.equal(
    canConfirmTaskVerification(
      { ...rahul, clearance: "director" },
      { status: "awaiting_verification", verificationDepartment: "Contracts" }
    ),
    false
  );

  const waiting = task({
    department: "Accounts",
    status: "awaiting_verification",
    verificationDepartment: "Contracts",
    assignees: ["Contracts User"],
  });
  const [confirmed] = applyTaskEditPolicy(
    [waiting],
    [task({ ...waiting, status: "completed", notes: "nope" })],
    rahul,
    people
  );
  assert.equal(confirmed?.status, "completed");
  assert.equal(confirmed?.notes, "keep");
  assert.equal(confirmed?.department, "Accounts");
  assert.deepEqual(confirmed?.assignees, ["Contracts User"]);

  const due = notice({
    id: "due",
    audienceUserNames: ["Contracts User"],
    audienceDepartment: "Contracts",
  });
  assert.equal(notificationVisibleTo(due, rahul), true);
  assert.equal(
    notificationVisibleTo(due, { ...rahul, secondDepartment: null, department: "Billing" }),
    false
  );
  assert.equal(
    notificationVisibleTo(due, {
      name: "Contracts User",
      clearance: "user",
      department: "Contracts",
      secondDepartment: "Billing",
    }),
    true
  );
  assert.equal(
    notificationVisibleTo(due, {
      name: "Other User",
      clearance: "user",
      department: "Contracts",
    }),
    false
  );
});
