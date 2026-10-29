import assert from "node:assert/strict";
import test from "node:test";
import { TASK_PRIORITY_LABELS } from "@/lib/types";
import {
  addSubtaskControl,
  closeTaskUpdates,
  initialTaskUpdatesBox,
  openTaskUpdates,
  saveUpdatesControl,
  settleTaskUpdatesSave,
  taskUpdatesSaveCloses,
  updatesBoxShowsAddSubtask,
} from "@/lib/task-updates-box";

test("opening a task keeps the updates box closed", () => {
  const box = initialTaskUpdatesBox();
  assert.equal(box.editing, false);
  assert.equal(box.addingSubtask, false);
  assert.equal(box.subtaskEditorId, null);
  assert.equal(box.editing ? "Close" : "Add updates", "Add updates");
  assert.equal(updatesBoxShowsAddSubtask(box.editing), false);
});

test("Add updates opens the box and Add subtask stays inside it", () => {
  const opened = openTaskUpdates(initialTaskUpdatesBox());
  assert.equal(opened.editing, true);
  assert.equal(updatesBoxShowsAddSubtask(opened.editing), true);
  assert.equal(updatesBoxShowsAddSubtask(false), false);
});

test("Close shuts the box without saving and clears nested editors", () => {
  const open = {
    ...openTaskUpdates(initialTaskUpdatesBox("sub-1")),
    addingSubtask: true,
  };
  const closed = closeTaskUpdates(open);
  assert.notEqual(closed, open);
  assert.deepEqual(closed, {
    editing: false,
    addingSubtask: false,
    subtaskEditorId: null,
  });
  assert.equal(closed.editing ? "Close" : "Add updates", "Add updates");
});

test("a successful save closes the box the same way Close does", () => {
  const open = {
    ...openTaskUpdates(initialTaskUpdatesBox("sub-1")),
    addingSubtask: true,
  };
  const settled = settleTaskUpdatesSave(open, { ok: true });
  assert.deepEqual(settled.box, closeTaskUpdates(open));
  assert.equal(settled.error, null);
  assert.equal(settled.box.editing, false);
  assert.equal(settled.box.addingSubtask, false);
  assert.equal(settled.box.subtaskEditorId, null);
  assert.equal(
    taskUpdatesSaveCloses({ errors: [], persisted: true, statusSaved: true }),
    true
  );
});

test("a refused save keeps the box open and the error visible", () => {
  const open = {
    ...openTaskUpdates(initialTaskUpdatesBox("sub-1")),
    addingSubtask: true,
  };
  const settled = settleTaskUpdatesSave(open, {
    ok: false,
    error: "You cannot save changes to this task.",
  });
  assert.equal(settled.box.editing, true);
  assert.equal(settled.box.addingSubtask, true);
  assert.equal(settled.box.subtaskEditorId, "sub-1");
  assert.equal(settled.error, "You cannot save changes to this task.");
  assert.equal(
    taskUpdatesSaveCloses({
      errors: [settled.error],
      persisted: true,
      statusSaved: true,
    }),
    false
  );
  assert.equal(
    taskUpdatesSaveCloses({ errors: [], persisted: false, statusSaved: true }),
    false
  );
  assert.equal(
    taskUpdatesSaveCloses({ errors: [], persisted: true, statusSaved: false }),
    false
  );
});

test("Save updates is centred and larger than Add subtask", () => {
  assert.equal(saveUpdatesControl.centred, true);
  assert.match(saveUpdatesControl.rowClassName, /justify-center/);
  assert.ok(saveUpdatesControl.heightPx > addSubtaskControl.heightPx);
  assert.equal(addSubtaskControl.label, "Add subtask");
  assert.equal(saveUpdatesControl.label, "Save updates");
});

test("Low stays in the priority list", () => {
  assert.equal(TASK_PRIORITY_LABELS.low, "Low");
  assert.deepEqual(Object.keys(TASK_PRIORITY_LABELS).sort(), [
    "high",
    "low",
    "normal",
    "urgent",
  ]);
});
