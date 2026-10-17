import assert from "node:assert/strict";
import test from "node:test";
import { assembleSubtaskView } from "@/lib/task-list";
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
    priority: "normal",
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
