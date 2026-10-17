import { namedOnTask } from "@/lib/task-permissions";
import {
  clearanceKey,
  sameDepartment,
  type TaskActor,
} from "@/lib/task-notices";
import type { Task, TaskDeadlineChangeLogEntry } from "@/lib/types";

export const TASK_DEADLINE_CLEAR_DENIED =
  "A saved deadline cannot be cleared.";

export const TASK_DEADLINE_REASON_REQUIRED =
  "A reason is required to move a saved deadline.";

export const TASK_DEADLINE_MOVE_DENIED = "You cannot move this deadline.";

export function normalizeDeadline(
  value: string | null | undefined
): string | null {
  const text = (value || "").trim();
  if (!text) return null;
  return text.slice(0, 10);
}

/** One line. Blank and whitespace-only reasons are empty. */
export function deadlineReasonLine(value: string | null | undefined): string {
  return (value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Master, a person named on this task, or the manager of this task’s own
 * department. Director is not that manager unless they are also named here.
 * A subtask is judged on its own assignees and department.
 */
export function canMoveTaskDeadline(
  actor: TaskActor | null | undefined,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  if (!actor) return false;
  const role = clearanceKey(actor.clearance);
  if (role === "master") return true;
  if (namedOnTask(actor, task)) return true;
  return role === "manager" && sameDepartment(actor.department, task.department);
}

export type DeadlineDecision =
  | { ok: true; dueDate: string | null; log: null }
  | {
      ok: true;
      dueDate: string;
      log: { fromDate: string; toDate: string; reason: string };
    }
  | { ok: false; error: string };

/**
 * Empty → date is a first deadline: no reason and no log row.
 * Date → blank is rejected, including for Master.
 * Date → a different date needs a person who may move it and a one-line reason.
 */
export function decideTaskDeadline(input: {
  currentDue: string | null | undefined;
  nextDue: string | null | undefined;
  reason?: string | null;
  actor: TaskActor | null | undefined;
  task: { department?: string | null; assignees?: string[] | null };
}): DeadlineDecision {
  const current = normalizeDeadline(input.currentDue);
  const next = normalizeDeadline(input.nextDue);
  if (current === next) return { ok: true, dueDate: current, log: null };
  if (!current && next) return { ok: true, dueDate: next, log: null };
  if (current && !next) {
    return { ok: false, error: TASK_DEADLINE_CLEAR_DENIED };
  }
  if (!canMoveTaskDeadline(input.actor, input.task)) {
    return { ok: false, error: TASK_DEADLINE_MOVE_DENIED };
  }
  const reason = deadlineReasonLine(input.reason);
  if (!reason) return { ok: false, error: TASK_DEADLINE_REASON_REQUIRED };
  return {
    ok: true,
    dueDate: next!,
    log: { fromDate: current!, toDate: next!, reason },
  };
}

export function normalizeTaskDeadlineChangeLog(
  entries: TaskDeadlineChangeLogEntry[] | null | undefined
): TaskDeadlineChangeLogEntry[] {
  const out: TaskDeadlineChangeLogEntry[] = [];
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "").trim();
    const fromDate = normalizeDeadline(entry.fromDate);
    const toDate = normalizeDeadline(entry.toDate);
    const reason = deadlineReasonLine(entry.reason);
    if (!id || !fromDate || !toDate || !reason || fromDate === toDate) continue;
    out.push({
      id,
      at: entry.at || new Date(0).toISOString(),
      by: (entry.by || "").trim() || "User",
      taskId: entry.taskId || "",
      contractId: entry.contractId ?? null,
      taskTitle: (entry.taskTitle || "").trim(),
      fromDate,
      toDate,
      reason,
    });
  }
  return out;
}

function freshReasonRow(
  fresh: TaskDeadlineChangeLogEntry[],
  taskId: string,
  fromDate: string | null,
  toDate: string | null
): TaskDeadlineChangeLogEntry | null {
  if (!fromDate || !toDate || fromDate === toDate) return null;
  return (
    fresh.find(
      (row) =>
        row.taskId === taskId &&
        row.fromDate === fromDate &&
        row.toDate === toDate
    ) ?? null
  );
}

/**
 * Keep a deadline move only when this save also records a real log row.
 * Existing rows stay. Master may replace the whole log with nothing.
 */
export function reconcileTaskDeadlineChanges(input: {
  previousTasks: Task[];
  tasks: Task[];
  previousLog: TaskDeadlineChangeLogEntry[] | null | undefined;
  incomingLog: TaskDeadlineChangeLogEntry[] | null | undefined;
  actor: TaskActor | null | undefined;
  allowClear: boolean;
}): { tasks: Task[]; log: TaskDeadlineChangeLogEntry[] } {
  const previousLog = normalizeTaskDeadlineChangeLog(input.previousLog);
  const rawIncoming = input.incomingLog ?? [];
  const incomingLog = normalizeTaskDeadlineChangeLog(rawIncoming);
  const clearing =
    input.allowClear && rawIncoming.length === 0 && previousLog.length > 0;
  const previousIds = new Set(previousLog.map((row) => row.id));
  const fresh = incomingLog.filter((row) => !previousIds.has(row.id));
  const previousById = new Map(input.previousTasks.map((task) => [task.id, task]));
  const accepted: TaskDeadlineChangeLogEntry[] = [];

  const tasks = input.tasks.map((next) => {
    const prev = previousById.get(next.id);
    if (!prev) return next;
    const fromDate = normalizeDeadline(prev.dueDate);
    const toDate = normalizeDeadline(next.dueDate);
    const row = freshReasonRow(fresh, prev.id, fromDate, toDate);
    const decision = decideTaskDeadline({
      currentDue: prev.dueDate,
      nextDue: next.dueDate,
      reason: row?.reason,
      actor: input.actor,
      task: prev,
    });
    if (!decision.ok) {
      return { ...next, dueDate: fromDate };
    }
    if (decision.log && row) {
      accepted.push({
        id: row.id,
        at: row.at || new Date().toISOString(),
        by: (input.actor?.name || "").trim() || row.by || "User",
        taskId: prev.id,
        contractId: prev.contractId ?? null,
        taskTitle: (prev.title || "").trim(),
        fromDate: decision.log.fromDate,
        toDate: decision.log.toDate,
        reason: decision.log.reason,
      });
    }
    return { ...next, dueDate: decision.dueDate };
  });

  if (clearing) return { tasks, log: [] };
  const log = [...previousLog];
  const seen = new Set(log.map((row) => row.id));
  for (const row of accepted) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    log.push(row);
  }
  return { tasks, log };
}
