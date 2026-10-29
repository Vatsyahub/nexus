import { sameDepartment } from "@/lib/task-notices";
import type { Task } from "@/lib/types";

export const TASK_VIEWS_WITH_SUBTASKS = [
  "unassigned",
  "open",
  "overdue",
  "no_deadline",
  "completed",
] as const;

export type SubtaskListView = (typeof TASK_VIEWS_WITH_SUBTASKS)[number];

function isOpen(task: Pick<Task, "status" | "deletedAt">): boolean {
  if (task.deletedAt) return false;
  return task.status !== "completed" && task.status !== "not_required";
}

export function taskMatchesHubView(
  task: Pick<Task, "status" | "department" | "assignees" | "dueDate" | "deletedAt">,
  view: SubtaskListView,
  today: string
): boolean {
  if (view === "unassigned") {
    return (
      isOpen(task) && !task.department && (task.assignees?.length ?? 0) === 0
    );
  }
  if (view === "open") return isOpen(task);
  if (view === "overdue") {
    return isOpen(task) && !!task.dueDate && task.dueDate < today;
  }
  if (view === "no_deadline") return isOpen(task) && !task.dueDate;
  return task.status === "completed" || task.status === "not_required";
}

export type TaskListRow = { parent: Task; subtasks: Task[] };

/**
 * Open, Overdue, No deadline, Unassigned, and Done keep a parent when a
 * subtask matches. The matching subtask is shown and counted.
 */
export function assembleSubtaskView(input: {
  tasks: Task[];
  view: SubtaskListView;
  today: string;
  matchesRow: (task: Task) => boolean;
  compare: (a: Task, b: Task) => number;
}): { rows: TaskListRow[]; counted: Task[] } {
  const parents = input.tasks.filter((task) => !task.parentId && !task.deletedAt);
  const byParent = new Map<string, Task[]>();
  for (const task of input.tasks) {
    if (!task.parentId || task.deletedAt) continue;
    const list = byParent.get(task.parentId) ?? [];
    list.push(task);
    byParent.set(task.parentId, list);
  }

  const rows: TaskListRow[] = [];
  const counted: Task[] = [];
  for (const parent of parents.slice().sort(input.compare)) {
    const kids = (byParent.get(parent.id) ?? [])
      .filter((task) => input.matchesRow(task))
      .filter((task) => taskMatchesHubView(task, input.view, input.today))
      .slice()
      .sort(input.compare);
    const parentMatches =
      input.matchesRow(parent) &&
      taskMatchesHubView(parent, input.view, input.today);
    if (!parentMatches && kids.length === 0) continue;
    rows.push({ parent, subtasks: kids });
    if (parentMatches) counted.push(parent);
    counted.push(...kids);
  }
  return { rows, counted };
}

export function isSubtaskListView(view: string): view is SubtaskListView {
  return (TASK_VIEWS_WITH_SUBTASKS as readonly string[]).includes(view);
}

/**
 * Parent stays when it matches or a subtask matches. Only matching
 * subtasks are kept on the row.
 */
export function assembleMatchedRows(input: {
  tasks: Task[];
  matchesTask: (task: Task) => boolean;
  compare: (a: Task, b: Task) => number;
}): { rows: TaskListRow[]; counted: Task[] } {
  const parents = input.tasks.filter((task) => !task.parentId && !task.deletedAt);
  const byParent = new Map<string, Task[]>();
  for (const task of input.tasks) {
    if (!task.parentId || task.deletedAt) continue;
    const list = byParent.get(task.parentId) ?? [];
    list.push(task);
    byParent.set(task.parentId, list);
  }

  const rows: TaskListRow[] = [];
  const counted: Task[] = [];
  for (const parent of parents.slice().sort(input.compare)) {
    const kids = (byParent.get(parent.id) ?? [])
      .filter((task) => input.matchesTask(task))
      .slice()
      .sort(input.compare);
    const parentMatches = input.matchesTask(parent);
    if (!parentMatches && kids.length === 0) continue;
    rows.push({ parent, subtasks: kids });
    if (parentMatches) counted.push(parent);
    counted.push(...kids);
  }
  return { rows, counted };
}

function groupIsOpen(row: TaskListRow, parentInView: boolean): boolean {
  if (parentInView && isOpen(row.parent)) return true;
  return row.subtasks.some((task) => isOpen(task));
}

/** Open groups first, then done groups. Done tasks sit at the bottom. */
export function orderOpenBeforeDone(
  rows: TaskListRow[],
  parentInView: (parent: Task) => boolean,
  compare: (a: Task, b: Task) => number
): TaskListRow[] {
  return rows.slice().sort((a, b) => {
    const aOpen = groupIsOpen(a, parentInView(a.parent));
    const bOpen = groupIsOpen(b, parentInView(b.parent));
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    return compare(a.parent, b.parent);
  });
}

export function taskInDepartments(
  task: Pick<Task, "department">,
  departments: string[]
): boolean {
  return departments.some((name) => sameDepartment(task.department, name));
}

/**
 * Tasks in any of the given departments, including a subtask whose own
 * department matches when the parent is in another department.
 * Done tasks stay, and open groups are ordered above done groups.
 */
export function assembleDepartmentView(input: {
  tasks: Task[];
  departments: string[];
  matchesRow: (task: Task) => boolean;
  compare: (a: Task, b: Task) => number;
}): { rows: TaskListRow[]; counted: Task[] } {
  const inDept = (task: Task) => taskInDepartments(task, input.departments);
  const matchesTask = (task: Task) => inDept(task) && input.matchesRow(task);
  const assembled = assembleMatchedRows({
    tasks: input.tasks,
    matchesTask,
    compare: input.compare,
  });
  return {
    rows: orderOpenBeforeDone(
      assembled.rows,
      (parent) => matchesTask(parent),
      input.compare
    ),
    counted: assembled.counted,
  };
}

export type SubtaskLine = { parent: Task; task: Task };

/** Matching subtasks only. A parent row is not included. */
export function subtasksOnlyLines(rows: TaskListRow[]): SubtaskLine[] {
  const lines: SubtaskLine[] = [];
  for (const row of rows) {
    for (const task of row.subtasks) lines.push({ parent: row.parent, task });
  }
  return lines;
}

/** List return path. Only the tasks list, with its own query, is kept. */
export function safeTaskListReturn(from: string | null | undefined): string {
  if (!from || !from.startsWith("/tasks") || from.startsWith("/tasks/")) {
    return "/tasks";
  }
  if (from.includes("://") || from.includes("\\")) return "/tasks";
  const query = from.indexOf("?");
  const path = query === -1 ? from : from.slice(0, query);
  if (path !== "/tasks") return "/tasks";
  return from;
}
