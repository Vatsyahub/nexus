import assert from "node:assert/strict";
import test from "node:test";
import { taskOverdueAudience } from "@/lib/task-notices";
import {
  isResponsiblePerson,
  responsiblePerson,
  storedResponsible,
} from "@/lib/task-responsible";
import { applyTaskEditPolicy } from "@/lib/task-permissions";
import type { Task } from "@/lib/types";

function task(partial: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Check site",
    contractId: "c1",
    department: "Contracts Department",
    assignees: ["Ada", "Bea"],
    status: "pending",
    dueDate: "2026-10-01",
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

test("the first named person is responsible until someone chooses another", () => {
  assert.equal(responsiblePerson(task()), "Ada");
  assert.equal(isResponsiblePerson(task(), "Ada"), true);
  assert.equal(isResponsiblePerson(task(), "Bea"), false);
  assert.equal(
    responsiblePerson(task({ responsible: "Bea" })),
    "Bea"
  );
  assert.equal(isResponsiblePerson(task({ responsible: "Bea" }), "Bea"), true);
  assert.equal(
    responsiblePerson(task({ responsible: "Gone" })),
    "Ada"
  );
});

test("overdue follows the responsible person and my tasks would too", () => {
  assert.deepEqual(taskOverdueAudience(task()), {
    names: ["Ada"],
    department: null,
  });
  assert.deepEqual(taskOverdueAudience(task({ responsible: "Bea" })), {
    names: ["Bea"],
    department: null,
  });
  assert.deepEqual(
    taskOverdueAudience(task({ assignees: [], responsible: null, department: "Contracts Department" })),
    { names: [], department: "Contracts Department" }
  );
});

test("a saved responsible person must still be named", () => {
  assert.equal(storedResponsible(["Ada", "Bea"], "bea"), "Bea");
  assert.equal(storedResponsible(["Ada"], "Bea"), null);
  const current = task({ responsible: "Bea" });
  const [saved] = applyTaskEditPolicy(
    [current],
    [task({ notes: "kept", responsible: "Ada", assignees: ["Ada", "Bea"] })],
    { name: "Outsider", clearance: "user", department: "Accounts Department" },
    []
  );
  assert.equal(saved?.responsible, "Bea");
  assert.equal(saved?.notes, "");
});
