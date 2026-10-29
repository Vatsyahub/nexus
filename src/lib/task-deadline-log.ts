import { formatDisplayDate } from "@/lib/dates";
import { canEditTaskSchedule } from "@/lib/task-permissions";
import { type TaskActor } from "@/lib/task-notices";
import {
  TASK_STATUS_LABELS,
  departmentDisplayName,
  type Task,
  type TaskDeadlineChangeLogEntry,
  type TaskSaveChange,
  type TaskSaveDeadlineChange,
  type TaskSaveSubtaskChange,
  type TaskSaveValueChange,
} from "@/lib/types";

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
 * Who may set or change a deadline on a task that already exists. A new
 * parent task or subtask keeps the due date its creator submitted, and does
 * not use this check.
 * Master, any Director, a person named on this task, or the manager of this
 * task’s own department — either department that manager holds. Before a
 * department is saved, only Master, any Director, or someone already named.
 * A subtask uses its own row.
 */
export function canMoveTaskDeadline(
  actor: TaskActor | null | undefined,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  return canEditTaskSchedule(actor, task);
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
 * Empty → date is a first deadline for someone who may set it: no reason.
 * Date → blank is rejected, including for Master.
 * Date → a different date needs a person who may change it and a one-line reason.
 * Someone who may edit the task but may not set the date does not change it.
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
  if (current && !next) {
    return { ok: false, error: TASK_DEADLINE_CLEAR_DENIED };
  }
  if (!canMoveTaskDeadline(input.actor, input.task)) {
    return { ok: false, error: TASK_DEADLINE_MOVE_DENIED };
  }
  if (!current && next) return { ok: true, dueDate: next, log: null };
  const reason = deadlineReasonLine(input.reason);
  if (!reason) return { ok: false, error: TASK_DEADLINE_REASON_REQUIRED };
  return {
    ok: true,
    dueDate: next!,
    log: { fromDate: current!, toDate: next!, reason },
  };
}

const SAVE_FIELDS = new Set(["name", "department", "people", "status", "note"]);

function blankLabel(value: string | null | undefined): string {
  const text = deadlineReasonLine(value);
  return text || "—";
}

function normalizeValueChange(
  raw: unknown
): TaskSaveValueChange | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TaskSaveValueChange>;
  if (!row.kind || !SAVE_FIELDS.has(row.kind)) return null;
  const from = blankLabel(row.from);
  const to = blankLabel(row.to);
  if (from === to) return null;
  return { kind: row.kind, from, to };
}

function normalizeDeadlineChange(
  raw: unknown
): TaskSaveDeadlineChange | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TaskSaveDeadlineChange>;
  if (row.kind !== "deadline") return null;
  const from = normalizeDeadline(row.from);
  const to = normalizeDeadline(row.to);
  if (from === to) return null;
  const reason = deadlineReasonLine(row.reason) || null;
  return { kind: "deadline", from, to, reason };
}

function normalizeSubtaskChange(raw: unknown): TaskSaveSubtaskChange | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TaskSaveSubtaskChange> & {
    changes?: unknown;
  };
  if (row.kind !== "subtask") return null;
  if (row.action !== "added" && row.action !== "edited" && row.action !== "removed") {
    return null;
  }
  const subtaskId = String(row.subtaskId || "").trim();
  if (!subtaskId) return null;
  const title = blankLabel(row.title);
  if (row.action !== "edited") {
    return { kind: "subtask", action: row.action, subtaskId, title };
  }
  const changes = normalizeFieldChanges(row.changes);
  if (changes.length === 0) return null;
  return { kind: "subtask", action: "edited", subtaskId, title, changes };
}

function normalizeFieldChanges(
  raw: unknown
): Array<TaskSaveValueChange | TaskSaveDeadlineChange> {
  if (!Array.isArray(raw)) return [];
  const out: Array<TaskSaveValueChange | TaskSaveDeadlineChange> = [];
  for (const item of raw) {
    const deadline = normalizeDeadlineChange(item);
    if (deadline) {
      out.push(deadline);
      continue;
    }
    const value = normalizeValueChange(item);
    if (value) out.push(value);
  }
  return out;
}

function normalizeChanges(raw: unknown): TaskSaveChange[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskSaveChange[] = [];
  for (const item of raw) {
    const deadline = normalizeDeadlineChange(item);
    if (deadline) {
      out.push(deadline);
      continue;
    }
    const value = normalizeValueChange(item);
    if (value) {
      out.push(value);
      continue;
    }
    const subtask = normalizeSubtaskChange(item);
    if (subtask) out.push(subtask);
  }
  return out;
}

export function normalizeTaskDeadlineChangeLog(
  entries: TaskDeadlineChangeLogEntry[] | null | undefined
): TaskDeadlineChangeLogEntry[] {
  const out: TaskDeadlineChangeLogEntry[] = [];
  for (const entry of entries ?? []) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id || "").trim();
    if (!id) continue;
    const fromDate = normalizeDeadline(entry.fromDate);
    const toDate = normalizeDeadline(entry.toDate);
    const reason = deadlineReasonLine(entry.reason);
    const moved = Boolean(fromDate && toDate && reason && fromDate !== toDate);
    const changes = normalizeChanges(entry.changes);
    if (!moved && changes.length === 0) continue;
    const row: TaskDeadlineChangeLogEntry = {
      id,
      at: entry.at || new Date(0).toISOString(),
      by: (entry.by || "").trim() || "User",
      taskId: entry.taskId || "",
      contractId: entry.contractId ?? null,
      taskTitle: (entry.taskTitle || "").trim(),
    };
    if (moved && fromDate && toDate) {
      row.fromDate = fromDate;
      row.toDate = toDate;
      row.reason = reason;
    }
    if (changes.length > 0) row.changes = changes;
    out.push(row);
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

export type TaskDeadlineReason = {
  taskId: string;
  fromDate: string;
  toDate: string;
  reason: string;
};

function peopleKey(names: string[] | null | undefined): string {
  return (names ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("\n");
}

function peopleLabel(names: string[] | null | undefined): string {
  const clean = (names ?? []).map((name) => name.trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : "—";
}

function departmentKey(value: string | null | undefined): string | null {
  const text = (value || "").trim();
  return text || null;
}

function departmentLabel(value: string | null): string {
  if (!value) return "—";
  return departmentDisplayName(value) || value;
}

function statusLabel(status: string): string {
  return TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] || status;
}

function titleLabel(value: string | null | undefined): string {
  return (value || "").trim() || "—";
}

function parentKey(task: { parentId?: string | null }): string {
  return (task.parentId || "").trim();
}

function fieldChanges(
  prev: Task,
  next: Task,
  reasons: TaskDeadlineReason[]
): Array<TaskSaveValueChange | TaskSaveDeadlineChange> {
  const out: Array<TaskSaveValueChange | TaskSaveDeadlineChange> = [];
  const fromTitle = titleLabel(prev.title);
  const toTitle = titleLabel(next.title);
  if (fromTitle !== toTitle) {
    out.push({ kind: "name", from: fromTitle, to: toTitle });
  }
  const fromDept = departmentKey(prev.department);
  const toDept = departmentKey(next.department);
  if (fromDept !== toDept) {
    out.push({
      kind: "department",
      from: departmentLabel(fromDept),
      to: departmentLabel(toDept),
    });
  }
  if (peopleKey(prev.assignees) !== peopleKey(next.assignees)) {
    out.push({
      kind: "people",
      from: peopleLabel(prev.assignees),
      to: peopleLabel(next.assignees),
    });
  }
  const fromDate = normalizeDeadline(prev.dueDate);
  const toDate = normalizeDeadline(next.dueDate);
  if (fromDate !== toDate) {
    const reason =
      fromDate && toDate
        ? (reasons.find(
            (row) =>
              row.taskId === prev.id &&
              row.fromDate === fromDate &&
              row.toDate === toDate
          )?.reason ?? null)
        : null;
    out.push({ kind: "deadline", from: fromDate, to: toDate, reason });
  }
  if (prev.status !== next.status) {
    out.push({
      kind: "status",
      from: statusLabel(prev.status),
      to: statusLabel(next.status),
    });
  }
  const fromNote = blankLabel(prev.notes);
  const toNote = blankLabel(next.notes);
  if (fromNote !== toNote) {
    out.push({ kind: "note", from: fromNote, to: toNote });
  }
  return out;
}

function saveEntry(
  task: Task,
  changes: TaskSaveChange[],
  by: string,
  at: string
): TaskDeadlineChangeLogEntry {
  const ownDeadline = changes.find(
    (change): change is TaskSaveDeadlineChange =>
      change.kind === "deadline" && Boolean(change.from) && Boolean(change.to)
  );
  const row: TaskDeadlineChangeLogEntry = {
    id: crypto.randomUUID(),
    at,
    by,
    taskId: task.id,
    contractId: task.contractId ?? null,
    taskTitle: (task.title || "").trim(),
    changes,
  };
  if (ownDeadline?.from && ownDeadline.to) {
    row.fromDate = ownDeadline.from;
    row.toDate = ownDeadline.to;
    if (ownDeadline.reason) row.reason = ownDeadline.reason;
  }
  return row;
}

/**
 * One line per saved task. A parent line includes subtasks added, edited,
 * or removed in that same save. A lone subtask edit is a line for that
 * subtask. A save with no logged field change produces nothing. Priority
 * is not a logged field. Creating or deleting a parent task is not a line.
 */
export function buildTaskSaveLog(input: {
  previousTasks: Task[];
  nextTasks: Task[];
  reasons?: TaskDeadlineReason[];
  by: string;
  at?: string;
}): TaskDeadlineChangeLogEntry[] {
  const reasons = input.reasons ?? [];
  const prevById = new Map(input.previousTasks.map((task) => [task.id, task]));
  const nextById = new Map(input.nextTasks.map((task) => [task.id, task]));
  const rootIds: string[] = [];
  const seenRoot = new Set<string>();
  const consider = (task: Task) => {
    const id = parentKey(task) || task.id;
    if (seenRoot.has(id)) return;
    seenRoot.add(id);
    rootIds.push(id);
  };
  for (const task of input.previousTasks) consider(task);
  for (const task of input.nextTasks) consider(task);

  const at = input.at ?? new Date().toISOString();
  const by = (input.by || "").trim() || "User";
  const entries: TaskDeadlineChangeLogEntry[] = [];

  for (const rootId of rootIds) {
    const parentPrev = prevById.get(rootId);
    const parentNext = nextById.get(rootId);
    if (!parentPrev || !parentNext) continue;
    if (parentPrev.deletedAt || parentNext.deletedAt) continue;

    const own = fieldChanges(parentPrev, parentNext, reasons);
    const childIds: string[] = [];
    const seenChild = new Set<string>();
    const addChild = (task: Task) => {
      if (parentKey(task) !== rootId || seenChild.has(task.id)) return;
      seenChild.add(task.id);
      childIds.push(task.id);
    };
    for (const task of input.previousTasks) addChild(task);
    for (const task of input.nextTasks) addChild(task);

    const added: TaskSaveSubtaskChange[] = [];
    const edited: TaskSaveSubtaskChange[] = [];
    const removed: TaskSaveSubtaskChange[] = [];
    let lone: { task: Task; changes: Array<TaskSaveValueChange | TaskSaveDeadlineChange> } | null =
      null;

    for (const childId of childIds) {
      const prev = prevById.get(childId);
      const next = nextById.get(childId);
      if (!prev && next && !next.deletedAt) {
        added.push({
          kind: "subtask",
          action: "added",
          subtaskId: childId,
          title: titleLabel(next.title),
        });
        continue;
      }
      if (prev && !prev.deletedAt && (!next || next.deletedAt)) {
        removed.push({
          kind: "subtask",
          action: "removed",
          subtaskId: childId,
          title: titleLabel(prev.title),
        });
        continue;
      }
      if (!prev || !next || prev.deletedAt || next.deletedAt) continue;
      const changes = fieldChanges(prev, next, reasons);
      if (changes.length === 0) continue;
      edited.push({
        kind: "subtask",
        action: "edited",
        subtaskId: childId,
        title: titleLabel(prev.title),
        changes,
      });
      lone = { task: prev, changes };
    }

    const onlySubtask =
      own.length === 0 &&
      added.length === 0 &&
      removed.length === 0 &&
      edited.length === 1 &&
      lone;
    if (onlySubtask) {
      entries.push(saveEntry(onlySubtask.task, onlySubtask.changes, by, at));
      continue;
    }
    const changes: TaskSaveChange[] = [...own, ...added, ...edited, ...removed];
    if (changes.length === 0) continue;
    entries.push(saveEntry(parentPrev, changes, by, at));
  }
  return entries;
}

function deadlineSentence(
  from: string | null,
  to: string | null,
  reason: string | null | undefined
): string {
  const left = from ? formatDisplayDate(from) : "No deadline";
  const right = to ? formatDisplayDate(to) : "No deadline";
  const base = `Deadline: ${left} → ${right}`;
  return reason ? `${base}. Reason: ${reason}` : base;
}

function describeField(
  change: TaskSaveValueChange | TaskSaveDeadlineChange
): string {
  if (change.kind === "deadline") {
    return deadlineSentence(change.from, change.to, change.reason);
  }
  const label =
    change.kind === "name"
      ? "Task name"
      : change.kind === "department"
        ? "Department"
        : change.kind === "people"
          ? "People"
          : change.kind === "status"
            ? "Status"
            : "Note";
  return `${label}: ${change.from} → ${change.to}`;
}

/** Readable lines for one log row, including an older deadline-only row. */
export function describeTaskChangeLog(
  entry: TaskDeadlineChangeLogEntry
): string[] {
  if (entry.changes && entry.changes.length > 0) {
    return entry.changes.map((change) => {
      if (change.kind === "subtask") {
        if (change.action === "added") return `Subtask added: ${change.title}`;
        if (change.action === "removed") return `Subtask removed: ${change.title}`;
        const inner = (change.changes ?? []).map(describeField).join("; ");
        return inner
          ? `Subtask edited: ${change.title} — ${inner}`
          : `Subtask edited: ${change.title}`;
      }
      return describeField(change);
    });
  }
  if (entry.fromDate && entry.toDate && entry.reason) {
    return [deadlineSentence(entry.fromDate, entry.toDate, entry.reason)];
  }
  return [];
}

/** Text a change-log search should see, including older deadline rows. */
export function taskChangeSearchBits(
  entry: TaskDeadlineChangeLogEntry
): string[] {
  const bits = [...describeTaskChangeLog(entry)];
  const walk = (
    changes: TaskSaveChange[] | undefined
  ) => {
    for (const change of changes ?? []) {
      if (change.kind === "deadline") {
        if (change.from) bits.push(change.from, formatDisplayDate(change.from));
        if (change.to) bits.push(change.to, formatDisplayDate(change.to));
        if (change.reason) bits.push(change.reason);
      } else if (change.kind === "subtask") {
        bits.push(change.title, change.action);
        walk(change.changes);
      } else {
        bits.push(change.from, change.to);
      }
    }
  };
  walk(entry.changes);
  return bits;
}

/**
 * Keep a deadline move only when this save has a real reason.
 * One save then writes one line for every field that changed.
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
  const reasons: TaskDeadlineReason[] = [];

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
    if (decision.log) {
      reasons.push({
        taskId: prev.id,
        fromDate: decision.log.fromDate,
        toDate: decision.log.toDate,
        reason: decision.log.reason,
      });
    }
    return { ...next, dueDate: decision.dueDate };
  });

  if (clearing) return { tasks, log: [] };
  const built = buildTaskSaveLog({
    previousTasks: input.previousTasks,
    nextTasks: tasks,
    reasons,
    by: (input.actor?.name || "").trim() || "User",
  });
  return {
    tasks,
    log: normalizeTaskDeadlineChangeLog([...previousLog, ...built]),
  };
}
