import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleDepartmentView,
  assembleSubtaskView,
  compareTasks,
  safeTaskListReturn,
  subtasksOnlyLines,
} from "@/lib/task-list";
import type { Task } from "@/lib/types";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    contractId: "c1",
    department: "Contracts Department",
    assignees: ["Ada"],
    status: "pending",
    dueDate: "2026-12-01",
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

const today = "2026-10-17";

function listed(view: "open" | "overdue" | "no_deadline" | "unassigned" | "completed", rows: Task[]) {
  return assembleSubtaskView({
    tasks: rows,
    view,
    today,
    matchesRow: () => true,
    compare: (a, b) => a.title.localeCompare(b.title),
  });
}

test("open, overdue, no deadline, unassigned, and done keep a parent for a matching subtask", () => {
  const parent = task({
    id: "parent",
    title: "Parent",
    status: "completed",
    completedAt: "2026-10-01T00:00:00.000Z",
    dueDate: "2026-09-01",
    department: "Contracts Department",
    assignees: ["Ada"],
  });
  const openSub = task({
    id: "open-sub",
    title: "Open sub",
    parentId: "parent",
    status: "in_progress",
    dueDate: null,
    department: null,
    assignees: [],
  });
  const overdueSub = task({
    id: "late-sub",
    title: "Late sub",
    parentId: "parent",
    status: "in_progress",
    dueDate: "2026-10-01",
    department: "Installation Department",
    assignees: ["Bea"],
  });
  const doneSub = task({
    id: "done-sub",
    title: "Done sub",
    parentId: "parent",
    status: "completed",
    dueDate: "2026-10-01",
    completedAt: "2026-10-02T00:00:00.000Z",
  });
  const rows = [parent, openSub, overdueSub, doneSub];

  const open = listed("open", rows);
  assert.deepEqual(open.rows.map((row) => row.parent.id), ["parent"]);
  assert.deepEqual(
    open.rows[0]?.subtasks.map((row) => row.id),
    ["late-sub", "open-sub"]
  );
  assert.deepEqual(
    open.counted.map((row) => row.id),
    ["late-sub", "open-sub"]
  );

  const overdue = listed("overdue", rows);
  assert.deepEqual(overdue.counted.map((row) => row.id), ["late-sub"]);
  assert.deepEqual(overdue.rows[0]?.subtasks.map((row) => row.title), ["Late sub"]);

  const noDeadline = listed("no_deadline", rows);
  assert.deepEqual(noDeadline.counted.map((row) => row.id), ["open-sub"]);

  const unassigned = listed("unassigned", rows);
  assert.deepEqual(unassigned.counted.map((row) => row.id), ["open-sub"]);

  const done = listed("completed", rows);
  assert.deepEqual(
    done.counted.map((row) => row.id),
    ["parent", "done-sub"]
  );
  assert.deepEqual(done.rows[0]?.subtasks.map((row) => row.id), ["done-sub"]);
});

test("a parent that matches is counted with its matching subtask", () => {
  const parent = task({
    id: "parent",
    title: "Parent",
    status: "in_progress",
    dueDate: "2026-10-01",
  });
  const sub = task({
    id: "sub",
    title: "Sub",
    parentId: "parent",
    status: "in_progress",
    dueDate: "2026-10-02",
  });
  const overdue = listed("overdue", [parent, sub]);
  assert.deepEqual(
    overdue.counted.map((row) => row.id),
    ["parent", "sub"]
  );
  assert.equal(overdue.rows.length, 1);
  assert.equal(overdue.rows[0]?.subtasks.length, 1);
});

test("dept tasks combine two departments and keep a foreign parent for a matching subtask", () => {
  const parent = task({
    id: "parent",
    title: "Other dept",
    department: "Accounts Department",
    status: "in_progress",
  });
  const sub = task({
    id: "sub",
    title: "Contracts piece",
    parentId: "parent",
    department: "Contracts Department",
    status: "in_progress",
  });
  const billing = task({
    id: "billing",
    title: "Billing parent",
    department: "Billing Department",
    status: "completed",
    completedAt: "2026-10-02T00:00:00.000Z",
  });
  const openContracts = task({
    id: "open-c",
    title: "Open contracts",
    department: "Contracts Department",
    status: "pending",
  });
  const view = assembleDepartmentView({
    tasks: [parent, sub, billing, openContracts],
    departments: ["Contracts Department", "Billing Department"],
    matchesRow: () => true,
    compare: (a, b) => a.title.localeCompare(b.title),
  });
  assert.deepEqual(
    view.rows.map((row) => row.parent.id),
    ["open-c", "parent", "billing"]
  );
  assert.deepEqual(view.rows[1]?.subtasks.map((row) => row.id), ["sub"]);
  assert.deepEqual(
    view.counted.map((row) => row.id).sort(),
    ["billing", "open-c", "sub"]
  );
  assert.deepEqual(
    subtasksOnlyLines(view.rows).map((line) => line.task.id),
    ["sub"]
  );
});

test("subtasks only drops a parent that is listed for a matching subtask", () => {
  const parent = task({
    id: "parent",
    title: "Parent",
    status: "completed",
    completedAt: "2026-10-01T00:00:00.000Z",
  });
  const sub = task({
    id: "sub",
    title: "Only child",
    parentId: "parent",
    status: "in_progress",
    dueDate: "2026-10-01",
  });
  const view = listed("overdue", [parent, sub]);
  assert.equal(view.rows.length, 1);
  assert.equal(view.rows[0]?.parent.id, "parent");
  const lines = subtasksOnlyLines(view.rows);
  assert.deepEqual(
    lines.map((line) => [line.task.id, line.parent.title]),
    [["sub", "Parent"]]
  );
});

test("list order is open, then overdue, then earlier deadline, then newer", () => {
  const today = "2026-10-17";
  const rows = [
    task({
      id: "done",
      title: "Finished",
      status: "completed",
      dueDate: "2026-01-01",
      createdAt: "2026-10-01T00:00:00.000Z",
    }),
    task({
      id: "later",
      title: "Later deadline",
      status: "pending",
      dueDate: "2026-12-20",
      createdAt: "2026-10-02T00:00:00.000Z",
    }),
    task({
      id: "overdue-new",
      title: "Overdue newer",
      status: "in_progress",
      dueDate: "2026-10-01",
      createdAt: "2026-10-03T00:00:00.000Z",
    }),
    task({
      id: "open-new",
      title: "Same deadline newer",
      status: "pending",
      dueDate: "2026-11-01",
      createdAt: "2026-10-05T00:00:00.000Z",
    }),
    task({
      id: "open-old",
      title: "Same deadline older",
      status: "pending",
      dueDate: "2026-11-01",
      createdAt: "2026-09-01T00:00:00.000Z",
    }),
    task({
      id: "overdue-old",
      title: "Overdue earlier",
      status: "pending",
      dueDate: "2026-09-01",
      createdAt: "2026-08-01T00:00:00.000Z",
    }),
  ];
  assert.deepEqual(
    rows.slice().sort((a, b) => compareTasks(a, b, today)).map((row) => row.id),
    ["overdue-old", "overdue-new", "open-new", "open-old", "later", "done"]
  );
});

test("a task list return keeps the tab and search", () => {
  assert.equal(
    safeTaskListReturn("/tasks?view=dept&q=pump&subs=1"),
    "/tasks?view=dept&q=pump&subs=1"
  );
  assert.equal(safeTaskListReturn("/tasks/abc"), "/tasks");
  assert.equal(safeTaskListReturn("/contracts?q=1"), "/tasks");
});
