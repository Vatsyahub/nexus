import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultAccess, type AccessMap } from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";
import {
  addContract,
  addManualTask,
  addSubtask,
  assignTask,
  getData,
  resetWorkspaceClientForTests,
  updateTask,
  updateTaskStatus,
} from "@/lib/store";
import type { TaskActor } from "@/lib/task-notices";
import {
  TASK_DEPARTMENT_LOCKED,
  type TaskDirectoryPerson,
} from "@/lib/task-permissions";
import {
  decideTaskDeadline,
  TASK_DEADLINE_CLEAR_DENIED,
  TASK_DEADLINE_MOVE_DENIED,
  TASK_DEADLINE_REASON_REQUIRED,
} from "@/lib/task-deadline-log";
import {
  EMPTY_NEXUS_COSTS,
  type FlowhubData,
  type Task,
  type TaskDeadlineChangeLogEntry,
} from "@/lib/types";
import { diffWorkspace } from "@/lib/workspace-changes";
import {
  mergeWorkspaceSave,
  resolveWorkspaceWrite,
  workspaceForAccount,
} from "@/lib/workspace-guard";

const people: TaskDirectoryPerson[] = [
  { name: "Priya Manager", department: "Contracts Department", clearance: "manager" },
  { name: "Isha Install", department: "Installation Department", clearance: "manager" },
  { name: "Anil User", department: "Drawings Department", clearance: "user" },
  { name: "Site Lead", department: "Installation Department", clearance: "user" },
];

const assignee: TaskActor = {
  name: "Anil User",
  clearance: "user",
  department: "Drawings Department",
};
const manager: TaskActor = {
  name: "Priya Manager",
  clearance: "manager",
  department: "Contracts Department",
};
const installManager: TaskActor = {
  name: "Isha Install",
  clearance: "manager",
  department: "Installation Department",
};
const master: TaskActor = {
  name: "Master Admin",
  clearance: "master",
  department: null,
};
const director: TaskActor = {
  name: "Deepa Director",
  clearance: "director",
  department: null,
};
const directorInDepartment: TaskActor = {
  name: "Deepa Director",
  clearance: "director",
  department: "Contracts Department",
};
const directorAssignee: TaskActor = {
  name: "Deepa Director",
  clearance: "director",
  department: null,
};

let seq = 0;

function access(overrides: Partial<AccessMap> = {}): AccessMap {
  return { ...defaultAccess("user"), ...overrides };
}

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts Department",
    assignees: ["Anil User"],
    status: "pending",
    dueDate: "2026-11-15",
    parentId: null,
    source: "manual",
    catalogKey: "custom",
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
    workspaceRevision: 4,
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

function logRow(
  partial: Partial<TaskDeadlineChangeLogEntry> & { id: string }
): TaskDeadlineChangeLogEntry {
  return {
    at: "2026-10-01T00:00:00.000Z",
    by: "Anil User",
    taskId: "task-1",
    contractId: "c1",
    taskTitle: "Check site",
    fromDate: "2026-10-01",
    toDate: "2026-11-15",
    reason: "Earlier move",
    ...partial,
  };
}

function rowsFor(taskId: string) {
  return (getData().taskDeadlineChangeLog ?? []).filter(
    (row) => row.taskId === taskId
  );
}

function freshTask(input: {
  title: string;
  department?: string | null;
  assignees?: string[];
  dueDate?: string | null;
}) {
  seq += 1;
  const { contract } = addContract({
    projectName: input.title,
    projectNo: `DL-${seq}`,
    orderNos: `DL-${seq}`,
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 1000,
    gstApplicable: false,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 0,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [],
  });
  return addManualTask({
    title: input.title,
    contractId: contract.id,
    department: input.department ?? "Contracts Department",
    assignees: input.assignees ?? ["Anil User"],
    dueDate: input.dueDate,
  });
}

function savedTask(id: string) {
  const row = getData().tasks.find((item) => item.id === id);
  assert.ok(row);
  return row;
}

describe("task deadline change log", { concurrency: false }, () => {
  test("setting a deadline for the first time writes no log row", () => {
    resetWorkspaceClientForTests();
    const byUpdate = freshTask({ title: "First by update", dueDate: null });
    const updated = updateTask(
      byUpdate.id,
      { dueDate: "2026-11-15" },
      { actor: director, people }
    );
    assert.equal(updated?.dueDate, "2026-11-15");
    assert.equal(rowsFor(byUpdate.id).length, 0);

    const byAssign = freshTask({ title: "First by assign", dueDate: null });
    const assigned = assignTask(
      byAssign.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-12-01",
      },
      { actor: assignee, people }
    );
    assert.equal(assigned.ok, true);
    assert.equal(savedTask(byAssign.id).dueDate, "2026-12-01");
    assert.equal(rowsFor(byAssign.id).length, 0);
    assert.equal(getData().taskDeadlineChangeLog.length, 0);
  });

  test("moving a deadline later or earlier requires a reason and writes one row", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({ title: "Move me", dueDate: "2026-11-15" });
    assert.equal(rowsFor(row.id).length, 0);

    assert.equal(
      updateTask(row.id, { dueDate: "2026-12-01" }, { actor: assignee, people }),
      null
    );
    assert.equal(savedTask(row.id).dueDate, "2026-11-15");
    assert.equal(rowsFor(row.id).length, 0);

    const blankReason = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-12-01",
      },
      { actor: assignee, people, deadlineReason: "   \n  " }
    );
    assert.equal(blankReason.ok, false);
    if (!blankReason.ok) {
      assert.equal(blankReason.error, TASK_DEADLINE_REASON_REQUIRED);
    }
    assert.equal(savedTask(row.id).dueDate, "2026-11-15");

    const later = updateTask(
      row.id,
      { dueDate: "2026-12-01" },
      { actor: assignee, people, deadlineReason: "Drawings slipped" }
    );
    assert.equal(later?.dueDate, "2026-12-01");
    const afterLater = rowsFor(row.id);
    assert.equal(afterLater.length, 1);
    assert.equal(afterLater[0]?.fromDate, "2026-11-15");
    assert.equal(afterLater[0]?.toDate, "2026-12-01");
    assert.equal(afterLater[0]?.by, "Anil User");
    assert.equal(afterLater[0]?.reason, "Drawings slipped");
    assert.ok(afterLater[0]?.at);

    const earlierDenied = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-10-01",
      },
      { actor: manager, people }
    );
    assert.equal(earlierDenied.ok, false);
    if (!earlierDenied.ok) {
      assert.equal(earlierDenied.error, TASK_DEADLINE_REASON_REQUIRED);
    }
    assert.equal(savedTask(row.id).dueDate, "2026-12-01");
    assert.equal(rowsFor(row.id).length, 1);

    const earlier = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-10-01",
      },
      { actor: manager, people, deadlineReason: "Customer pulled it forward" }
    );
    assert.equal(earlier.ok, true);
    assert.equal(savedTask(row.id).dueDate, "2026-10-01");
    const both = rowsFor(row.id);
    assert.equal(both.length, 2);
    assert.equal(both[1]?.fromDate, "2026-12-01");
    assert.equal(both[1]?.toDate, "2026-10-01");
    assert.equal(both[1]?.by, "Priya Manager");
    assert.equal(both[1]?.reason, "Customer pulled it forward");
  });

  test("blanking a saved deadline is rejected for Master too", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({ title: "Keep the date", dueDate: "2026-11-15" });
    assert.equal(
      updateTask(
        row.id,
        { dueDate: null, notes: "should not stick" },
        { actor: master, people }
      ),
      null
    );
    assert.equal(savedTask(row.id).dueDate, "2026-11-15");
    assert.equal(savedTask(row.id).notes, "");
    assert.equal(rowsFor(row.id).length, 0);

    const cleared = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "  ",
      },
      { actor: master, people, deadlineReason: "Not needed" }
    );
    assert.equal(cleared.ok, false);
    if (!cleared.ok) assert.equal(cleared.error, TASK_DEADLINE_CLEAR_DENIED);
    assert.equal(savedTask(row.id).dueDate, "2026-11-15");
    assert.equal(rowsFor(row.id).length, 0);
  });

  test("a director can move a deadline without being named or the department manager", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({ title: "Director locked", dueDate: "2026-11-15" });
    const moved = updateTask(
      row.id,
      { dueDate: "2026-12-01", notes: "director note" },
      { actor: director, people, deadlineReason: "I run the company" }
    );
    assert.equal(moved?.dueDate, "2026-12-01");
    assert.equal(moved?.notes, "director note");
    assert.equal(rowsFor(row.id).length, 1);
    assert.equal(rowsFor(row.id)[0]?.by, "Deepa Director");

    const sameDepartment = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-12-20",
      },
      {
        actor: directorInDepartment,
        people,
        deadlineReason: "My department",
      }
    );
    assert.equal(sameDepartment.ok, true);
    assert.equal(savedTask(row.id).dueDate, "2026-12-20");
    assert.equal(rowsFor(row.id).length, 2);
  });

  test("an assignee and that department’s manager can move a deadline", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({
      title: "Named and managed",
      dueDate: "2026-11-15",
      assignees: ["Anil User"],
    });
    const byAssignee = updateTask(
      row.id,
      { dueDate: "2026-12-01" },
      { actor: assignee, people, deadlineReason: "I am named on it" }
    );
    assert.equal(byAssignee?.dueDate, "2026-12-01");
    assert.equal(rowsFor(row.id)[0]?.by, "Anil User");

    const byManager = assignTask(
      row.id,
      {
        department: "Contracts Department",
        assignees: ["Anil User"],
        dueDate: "2026-12-20",
      },
      { actor: manager, people, deadlineReason: "Department manager" }
    );
    assert.equal(byManager.ok, true);
    assert.equal(savedTask(row.id).dueDate, "2026-12-20");
    assert.equal(rowsFor(row.id)[1]?.by, "Priya Manager");
    assert.equal(rowsFor(row.id)[1]?.reason, "Department manager");

    const directed = freshTask({
      title: "Director is named",
      dueDate: "2026-11-15",
      assignees: ["Deepa Director"],
    });
    const byNamedDirector = updateTask(
      directed.id,
      { dueDate: "2026-11-01" },
      { actor: directorAssignee, people, deadlineReason: "I am on this task" }
    );
    assert.equal(byNamedDirector?.dueDate, "2026-11-01");
    assert.equal(rowsFor(directed.id).length, 1);
    assert.equal(rowsFor(directed.id)[0]?.by, "Deepa Director");
  });

  test("master can move a deadline when a reason is given", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({ title: "Master move", dueDate: "2026-11-15" });
    const moved = updateTask(
      row.id,
      { dueDate: "2026-12-01" },
      { actor: master, people, deadlineReason: "Master moved it" }
    );
    assert.equal(moved?.dueDate, "2026-12-01");
    const log = rowsFor(row.id);
    assert.equal(log.length, 1);
    assert.equal(log[0]?.fromDate, "2026-11-15");
    assert.equal(log[0]?.toDate, "2026-12-01");
    assert.equal(log[0]?.by, "Master Admin");
    assert.equal(log[0]?.reason, "Master moved it");
  });

  test("a subtask deadline uses that subtask, not its parent", () => {
    resetWorkspaceClientForTests();
    const parent = freshTask({
      title: "Parent row",
      dueDate: "2026-11-15",
      assignees: ["Anil User"],
    });
    const sub = addSubtask(parent.id, {
      title: "Install frames",
      department: "Installation Department",
      assignees: ["Site Lead"],
      dueDate: "2026-11-20",
    });
    assert.ok(sub);
    assert.equal(rowsFor(sub.id).length, 0);

    const parentAssignee = updateTask(
      sub.id,
      { dueDate: "2026-12-01" },
      { actor: assignee, people, deadlineReason: "Parent person" }
    );
    assert.equal(parentAssignee, null);
    assert.equal(savedTask(sub.id).dueDate, "2026-11-20");

    const parentManager = updateTask(
      sub.id,
      { dueDate: "2026-12-01" },
      { actor: manager, people, deadlineReason: "Parent department" }
    );
    assert.equal(parentManager, null);
    assert.equal(savedTask(sub.id).dueDate, "2026-11-20");
    assert.equal(rowsFor(sub.id).length, 0);

    const noted = updateTask(
      sub.id,
      { notes: "director note" },
      { actor: director, people }
    );
    assert.equal(noted?.notes, "director note");
    const byDirector = updateTask(
      sub.id,
      { dueDate: "2026-11-25" },
      { actor: director, people, deadlineReason: "Director" }
    );
    assert.equal(byDirector?.dueDate, "2026-11-25");
    assert.equal(savedTask(sub.id).notes, "director note");
    assert.equal(rowsFor(sub.id).length, 1);

    const bySubAssignee = updateTask(
      sub.id,
      { dueDate: "2026-12-01" },
      {
        actor: {
          name: "Site Lead",
          clearance: "user",
          department: "Installation Department",
        },
        people,
        deadlineReason: "Named on the subtask",
      }
    );
    assert.equal(bySubAssignee?.dueDate, "2026-12-01");
    assert.equal(rowsFor(sub.id).length, 2);

    const byInstallManager = assignTask(
      sub.id,
      {
        department: "Installation Department",
        assignees: ["Site Lead"],
        dueDate: "2026-12-15",
      },
      { actor: installManager, people, deadlineReason: "Install manager" }
    );
    assert.equal(byInstallManager.ok, true);
    assert.equal(savedTask(sub.id).dueDate, "2026-12-15");
    assert.equal(savedTask(parent.id).dueDate, "2026-11-15");
    assert.equal(rowsFor(parent.id).length, 0);
    assert.equal(rowsFor(sub.id).length, 3);
  });

  test("notes and status do not write a deadline log row", () => {
    resetWorkspaceClientForTests();
    const row = freshTask({ title: "Other fields", dueDate: "2026-11-15" });
    updateTask(
      row.id,
      { notes: "progress" },
      { actor: assignee, people }
    );
    updateTaskStatus(row.id, "in_progress", { actor: assignee, notes: "going" });
    assert.equal(savedTask(row.id).dueDate, "2026-11-15");
    assert.equal(savedTask(row.id).notes, "going");
    assert.equal(rowsFor(row.id).length, 0);
    assert.equal(getData().taskDeadlineChangeLog.length, 0);
  });
});

test("the workspace save enforces the deadline rules and does not drop the log", () => {
  const current = task();
  const peopleForSave = people;

  function saved(next: Task, extraLog: TaskDeadlineChangeLogEntry[], actor: TaskActor, clearance: ClearanceRole) {
    const base = file({ tasks: [current] });
    const incoming = file({
      tasks: [next],
      taskDeadlineChangeLog: extraLog,
    });
    return mergeWorkspaceSave(
      base,
      incoming,
      access({ tasks: "edit" }),
      clearance,
      { actor, people: peopleForSave }
    );
  }

  const fresh = file({
    tasks: [task({ id: "fresh", dueDate: null, title: "Fresh" })],
  });
  const firstSet = mergeWorkspaceSave(
    fresh,
    file({
      tasks: [task({ id: "fresh", dueDate: "2026-11-15", title: "Fresh" })],
      taskDeadlineChangeLog: [
        logRow({
          id: "forged-first",
          taskId: "fresh",
          fromDate: "2026-01-01",
          toDate: "2026-11-15",
          reason: "Not a move",
        }),
      ],
    }),
    access({ tasks: "edit" }),
    "director",
    { actor: director, people }
  );
  assert.equal(firstSet.tasks[0]?.dueDate, "2026-11-15");
  assert.equal(firstSet.taskDeadlineChangeLog.length, 0);

  const noReason = saved(task({ dueDate: "2026-12-01" }), [], assignee, "user");
  assert.equal(noReason.tasks[0]?.dueDate, "2026-11-15");
  assert.equal(noReason.taskDeadlineChangeLog.length, 0);

  const later = saved(
    task({ dueDate: "2026-12-01" }),
    [
      logRow({
        id: "later",
        fromDate: "2026-11-15",
        toDate: "2026-12-01",
        reason: "  Later date  ",
        by: "Spoofed",
      }),
    ],
    assignee,
    "user"
  );
  assert.equal(later.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(later.taskDeadlineChangeLog.length, 1);
  assert.equal(later.taskDeadlineChangeLog[0]?.fromDate, "2026-11-15");
  assert.equal(later.taskDeadlineChangeLog[0]?.toDate, "2026-12-01");
  assert.equal(later.taskDeadlineChangeLog[0]?.reason, "Later date");
  assert.equal(later.taskDeadlineChangeLog[0]?.by, "Anil User");

  const earlierBase = task({ dueDate: "2026-12-01" });
  const earlier = mergeWorkspaceSave(
    file({ tasks: [earlierBase] }),
    file({
      tasks: [task({ dueDate: "2026-10-01" })],
      taskDeadlineChangeLog: [
        logRow({
          id: "earlier",
          fromDate: "2026-12-01",
          toDate: "2026-10-01",
          reason: "Earlier date",
        }),
      ],
    }),
    access({ tasks: "edit" }),
    "manager",
    { actor: manager, people }
  );
  assert.equal(earlier.tasks[0]?.dueDate, "2026-10-01");
  assert.equal(earlier.taskDeadlineChangeLog.length, 1);
  assert.equal(earlier.taskDeadlineChangeLog[0]?.by, "Priya Manager");

  const blank = saved(task({ dueDate: null }), [], master, "master");
  assert.equal(blank.tasks[0]?.dueDate, "2026-11-15");
  assert.equal(blank.taskDeadlineChangeLog.length, 0);

  const byDirector = saved(
    task({ dueDate: "2026-12-01" }),
    [
      logRow({
        id: "director-row",
        fromDate: "2026-11-15",
        toDate: "2026-12-01",
        reason: "Director",
        by: "Deepa Director",
      }),
    ],
    director,
    "director"
  );
  assert.equal(byDirector.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(byDirector.taskDeadlineChangeLog.length, 1);
  assert.equal(byDirector.taskDeadlineChangeLog[0]?.by, "Deepa Director");

  const byMaster = saved(
    task({ dueDate: "2026-12-01" }),
    [
      logRow({
        id: "master-row",
        fromDate: "2026-11-15",
        toDate: "2026-12-01",
        reason: "Master",
      }),
    ],
    master,
    "master"
  );
  assert.equal(byMaster.tasks[0]?.dueDate, "2026-12-01");
  assert.equal(byMaster.taskDeadlineChangeLog[0]?.by, "Master Admin");
});

test("clearing the task deadline change log is master only and removes every row", () => {
  const current = file({
    tasks: [task(), task({ id: "task-2", title: "Other" })],
    taskDeadlineChangeLog: [
      logRow({ id: "row-1", taskId: "task-1" }),
      logRow({ id: "row-2", taskId: "task-2", taskTitle: "Other" }),
    ],
  });
  const incoming = file({
    tasks: current.tasks,
    taskDeadlineChangeLog: [],
  });
  const map = access({ tasks: "edit" });
  const kept = resolveWorkspaceWrite(
    current,
    {
      baseRevision: current.workspaceRevision ?? 0,
      changes: diffWorkspace(current, incoming),
    },
    map,
    "director"
  );
  assert.equal(kept.action, "save");
  if (kept.action !== "save") return;
  assert.equal(kept.data.taskDeadlineChangeLog.length, 2);
  assert.equal(kept.data.tasks.length, 2);

  const cleared = resolveWorkspaceWrite(
    current,
    {
      baseRevision: current.workspaceRevision ?? 0,
      changes: diffWorkspace(current, incoming),
    },
    map,
    "master"
  );
  assert.equal(cleared.action, "save");
  if (cleared.action !== "save") return;
  assert.equal(cleared.data.taskDeadlineChangeLog.length, 0);
  assert.equal(cleared.data.tasks[0]?.dueDate, "2026-11-15");
  assert.equal(cleared.data.tasks[1]?.title, "Other");

  const userTried = resolveWorkspaceWrite(
    current,
    {
      baseRevision: current.workspaceRevision ?? 0,
      changes: {
        taskDeadlineChangeLog: { delete: ["row-1", "row-2"] },
      },
    },
    map,
    "user",
    { actor: assignee, people }
  );
  assert.equal(userTried.action, "save");
  if (userTried.action !== "save") return;
  assert.equal(userTried.data.taskDeadlineChangeLog.length, 2);
});

test("a task save does not drop the deadline log, and only master and director receive it", () => {
  const stored = file({
    tasks: [task({ notes: "keep" })],
    taskDeadlineChangeLog: [
      logRow({ id: "row-1" }),
      logRow({ id: "row-2", taskId: "task-2" }),
    ],
  });
  const map = access({ tasks: "edit" });
  for (const clearance of ["user", "manager"] as const) {
    assert.equal(
      workspaceForAccount(stored, map, clearance).taskDeadlineChangeLog.length,
      0
    );
  }
  assert.equal(
    workspaceForAccount(stored, map, "director").taskDeadlineChangeLog.length,
    2
  );
  assert.equal(
    workspaceForAccount(stored, map, "master").taskDeadlineChangeLog.length,
    2
  );
  assert.equal(workspaceForAccount(stored, map).taskDeadlineChangeLog.length, 0);

  const loaded = workspaceForAccount(stored, map, "user");
  const edited: FlowhubData = {
    ...loaded,
    tasks: [task({ notes: "assignee note" })],
  };
  const saved = resolveWorkspaceWrite(
    stored,
    {
      baseRevision: loaded.workspaceRevision ?? 0,
      changes: diffWorkspace(loaded, edited),
    },
    map,
    "user",
    { actor: assignee, people }
  );
  assert.equal(saved.action, "save");
  if (saved.action !== "save") return;
  assert.equal(saved.data.tasks[0]?.notes, "assignee note");
  assert.equal(saved.data.tasks[0]?.dueDate, "2026-11-15");
  assert.equal(saved.data.taskDeadlineChangeLog.length, 2);
  assert.deepEqual(
    saved.data.taskDeadlineChangeLog.map((row) => row.id).sort(),
    ["row-1", "row-2"]
  );
});

test("a due date can be changed only by the people on that task", () => {
  resetWorkspaceClientForTests();
  const row = freshTask({
    title: "Schedule lock",
    department: "Contracts Department",
    assignees: ["Anil User"],
    dueDate: "2026-11-15",
  });

  const byNamed = updateTask(
    row.id,
    { dueDate: "2026-12-01" },
    { actor: assignee, people, deadlineReason: "Named on it" }
  );
  assert.equal(byNamed?.dueDate, "2026-12-01");

  const byManager = updateTask(
    row.id,
    { dueDate: "2026-12-20" },
    { actor: manager, people, deadlineReason: "My department" }
  );
  assert.equal(byManager?.dueDate, "2026-12-20");

  const byDirector = updateTask(
    row.id,
    { dueDate: "2026-11-01" },
    { actor: director, people, deadlineReason: "Director" }
  );
  assert.equal(byDirector?.dueDate, "2026-11-01");

  assert.equal(
    updateTask(
      row.id,
      { dueDate: "2026-10-01", notes: "other manager" },
      { actor: installManager, people, deadlineReason: "Not my department" }
    ),
    null
  );
  const unrelated: TaskActor = {
    name: "New Joiner",
    clearance: "user",
    department: "Contracts Department",
  };
  assert.equal(
    updateTask(
      row.id,
      { dueDate: "2026-10-02", notes: "unrelated" },
      { actor: unrelated, people, deadlineReason: "No" }
    ),
    null
  );
  assert.equal(savedTask(row.id).dueDate, "2026-11-01");
  assert.equal(savedTask(row.id).notes, "");
  assert.equal(savedTask(row.id).department, "Contracts Department");

  assert.equal(
    updateTask(
      row.id,
      { dueDate: null, notes: "clear" },
      { actor: director, people }
    ),
    null
  );
  assert.equal(savedTask(row.id).dueDate, "2026-11-01");
  assert.equal(savedTask(row.id).notes, "");

  const relock = assignTask(
    row.id,
    { department: "Installation Department" },
    { actor: master, people }
  );
  assert.equal(relock.ok, false);
  if (!relock.ok) assert.equal(relock.error, TASK_DEPARTMENT_LOCKED);
  assert.equal(savedTask(row.id).department, "Contracts Department");

  const open = addManualTask({
    title: "No department yet",
    contractId: row.contractId!,
    department: null,
    assignees: [],
    dueDate: null,
  });
  const stillEditable = updateTask(
    open.id,
    { notes: "notes stay", dueDate: "2026-12-01" },
    { actor: unrelated, people }
  );
  assert.equal(stillEditable?.notes, "notes stay");
  assert.equal(stillEditable?.dueDate, null);

  const managerFirst = assignTask(
    open.id,
    {
      department: "Contracts Department",
      assignees: [],
      dueDate: "2026-12-01",
    },
    { actor: manager, people }
  );
  assert.equal(managerFirst.ok, true);
  assert.equal(savedTask(open.id).department, "Contracts Department");
  assert.equal(savedTask(open.id).dueDate, null);
  assert.equal(savedTask(open.id).notes, "notes stay");
  const managerAfter = updateTask(
    open.id,
    { dueDate: "2026-12-01" },
    { actor: manager, people }
  );
  assert.equal(managerAfter?.dueDate, "2026-12-01");
  const denied = decideTaskDeadline({
    currentDue: null,
    nextDue: "2026-12-01",
    actor: unrelated,
    task: open,
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.error, TASK_DEADLINE_MOVE_DENIED);

  const namedOpen = addManualTask({
    title: "Named before a department",
    contractId: row.contractId!,
    department: null,
    assignees: ["Anil User"],
    dueDate: null,
  });
  const namedSet = updateTask(
    namedOpen.id,
    { dueDate: "2026-12-01", notes: "named" },
    { actor: assignee, people }
  );
  assert.equal(namedSet?.dueDate, "2026-12-01");
  assert.equal(namedSet?.notes, "named");

  const sub = addSubtask(row.id, {
    title: "Install frames",
    department: "Installation Department",
    assignees: ["Site Lead"],
    dueDate: "2026-11-20",
  });
  assert.ok(sub);
  assert.equal(
    updateTask(
      sub.id,
      { dueDate: "2026-12-01" },
      { actor: manager, people, deadlineReason: "Parent department" }
    ),
    null
  );
  const byInstall = updateTask(
    sub.id,
    { dueDate: "2026-12-15" },
    { actor: installManager, people, deadlineReason: "Own department" }
  );
  assert.equal(byInstall?.dueDate, "2026-12-15");
  assert.equal(savedTask(row.id).dueDate, "2026-11-01");
});
