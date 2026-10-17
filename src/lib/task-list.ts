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
