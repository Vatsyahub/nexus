import { taskNotificationHref } from "@/lib/notification-href";
import { responsiblePerson } from "@/lib/task-responsible";
import type { HubNotification, Task } from "@/lib/types";


/** Signed-in person, as the bell and task screen already know them. */
export type NoticeViewer = {
  name: string | null | undefined;
  department: string | null | undefined;
  /** Manager's other department. Ignored for every other clearance. */
  secondDepartment?: string | null;
  /** Session role or Prisma clearance. Compared case-insensitively. */
  clearance?: string | null;
};

/** Person who is marking a task completed or confirming one. */
export type TaskActor = {
  name?: string | null;
  clearance?: string | null;
  department?: string | null;
  /** Manager's other department. Ignored for every other clearance. */
  secondDepartment?: string | null;
};

export function clearanceKey(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function sameDepartment(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  return left.length > 0 && left === right;
}

/**
 * True when this person is a manager and either stored department is the one
 * being asked about. User, Director, and Master do not match through a
 * second department.
 */
export function managerOfDepartment(
  person: {
    clearance?: string | null;
    department?: string | null;
    secondDepartment?: string | null;
  },
  department: string | null | undefined
): boolean {
  if (clearanceKey(person.clearance) !== "manager") return false;
  return (
    sameDepartment(person.department, department) ||
    sameDepartment(person.secondDepartment, department)
  );
}

/**
 * Manager, Director, and Master finish a task themselves.
 * User (and anyone without one of those clearances) waits for verification.
 */
export function completesImmediately(
  clearance: string | null | undefined
): boolean {
  const role = clearanceKey(clearance);
  return role === "manager" || role === "director" || role === "master";
}

export function completionNeedsVerification(
  clearance: string | null | undefined
): boolean {
  return !completesImmediately(clearance);
}

/**
 * Named people win over a department. No names and no department → nobody.
 * Department is returned only when no one is named, so managers are not
 * copied on a notice that already goes to the assignees.
 * Due-today warnings use taskDueTodayAudience instead.
 */
export function taskAlertAudience(
  task: Pick<Task, "assignees" | "department">
): { names: string[]; department: string | null } | null {
  const names = (task.assignees ?? []).map((a) => a.trim()).filter(Boolean);
  const department = task.department?.trim() || null;
  if (names.length > 0) return { names, department: null };
  if (department) return { names: [], department };
  return null;
}

/**
 * Overdue notice: the responsible person, not every named person.
 * No names and a department still reaches that department's managers.
 */
export function taskOverdueAudience(
  task: Pick<Task, "assignees" | "department" | "responsible">
): { names: string[]; department: string | null } | null {
  const person = responsiblePerson(task);
  const department = task.department?.trim() || null;
  if (person) return { names: [person], department: null };
  if (department) return { names: [], department };
  return null;
}

/**
 * Due-today warning: named assignees and the managers of the task's
 * department. A manager matches when either of their departments is that
 * one department. One row covers both, so a person who is an assignee and a
 * manager of that department is not notified twice. Department-only tasks
 * still reach that department's managers.
 */
export function taskDueTodayAudience(
  task: Pick<Task, "assignees" | "department">
): { names: string[]; department: string | null } | null {
  const names = (task.assignees ?? []).map((a) => a.trim()).filter(Boolean);
  const department = task.department?.trim() || null;
  if (names.length === 0 && !department) return null;
  return { names, department };
}

/**
 * Named people match the person. Department matches managers of that
 * department, including a manager's second department. A row may set both
 * (due-today): either audience sees the one notice. audienceClearance
 * "master" is the no-department fallback.
 */
export function notificationVisibleTo(
  n: HubNotification,
  user: NoticeViewer
): boolean {
  if (n.audienceClearance === "master") {
    return clearanceKey(user.clearance) === "master";
  }
  const names = n.audienceUserNames ?? [];
  if (names.length > 0) {
    const name = (user.name || "").trim().toLowerCase();
    if (name && names.some((a) => a.trim().toLowerCase() === name)) {
      return true;
    }
  }
  if (n.audienceDepartment) {
    return managerOfDepartment(user, n.audienceDepartment);
  }
  return false;
}

/** Managers of the waiting user's department, or Master when that department is missing. */
export function taskVerifyNotice(task: Task, actor: TaskActor): HubNotification {
  const dept = (actor.department || "").trim() || null;
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    kind: "task_verify",
    title: "Verify completed task",
    body: task.title,
    href: taskNotificationHref(task),
    taskId: task.id,
    contractId: task.contractId,
    audienceUserNames: [],
    audienceDepartment: dept,
    audienceClearance: dept ? null : "master",
    createdBy: actor.name ?? null,
    readByUserIds: [],
    readAtByUserIds: {},
    clearedByUserIds: [],
  };
}

function isSubtaskRow(task: { parentId?: string | null }): boolean {
  return (task.parentId || "").trim().length > 0;
}

/**
 * A subtask completion must not add a verify notice.
 * A parent that a user has just parked still gets one if the save omitted it.
 * Notices already stored are left alone.
 */
export function reconcileTaskVerifyNotices(input: {
  previousTasks: Task[];
  tasks: Task[];
  previousNotifications: HubNotification[];
  notifications: HubNotification[];
  actor: TaskActor | null | undefined;
}): HubNotification[] {
  const previousIds = new Set(input.previousNotifications.map((notice) => notice.id));
  const previousById = new Map(input.previousTasks.map((task) => [task.id, task]));
  const subtaskIds = new Set(
    input.tasks.filter((task) => isSubtaskRow(task)).map((task) => task.id)
  );
  const kept = input.notifications.filter((notice) => {
    if (notice.kind !== "task_verify" || previousIds.has(notice.id)) return true;
    return !(notice.taskId && subtaskIds.has(notice.taskId));
  });
  if (!input.actor) return kept;
  const extra: HubNotification[] = [];
  for (const task of input.tasks) {
    if (isSubtaskRow(task)) continue;
    const prev = previousById.get(task.id);
    if (!prev) continue;
    if (task.status !== "awaiting_verification") continue;
    if (prev.status === "awaiting_verification") continue;
    const alreadyRaised = kept.some(
      (notice) =>
        notice.kind === "task_verify" &&
        notice.taskId === task.id &&
        !previousIds.has(notice.id)
    );
    if (alreadyRaised) continue;
    extra.push(
      taskVerifyNotice(task, {
        name: input.actor.name,
        department: task.verificationDepartment,
      })
    );
  }
  return extra.length ? [...kept, ...extra] : kept;
}

/** Department manager for the waiting user's department, or Master for any. */
export function canConfirmTaskVerification(
  actor: TaskActor,
  task: Pick<Task, "status" | "verificationDepartment">
): boolean {
  if (task.status !== "awaiting_verification") return false;
  const role = clearanceKey(actor.clearance);
  if (role === "master") return true;
  return managerOfDepartment(actor, task.verificationDepartment);
}

function dueKey(value: string | null | undefined): string {
  return (value || "").slice(0, 10);
}

export type DueNoticeHit = {
  taskId: string;
  which: "overdue" | "due_today";
  due: string;
};

/**
 * One overdue notice the first day a task is past due, and one due-today
 * notice on the due date. Markers are the due date itself so a reload or a
 * later day does not send the same notice again. Completed and not-required
 * are skipped. Waiting-for-verification stays eligible.
 */
export function planDueNotices(
  tasks: Task[],
  today: string
): { tasks: Task[]; hits: DueNoticeHit[] } {
  const hits: DueNoticeHit[] = [];
  const next = tasks.map((t) => {
    if (t.deletedAt) return t;
    if (t.status === "completed" || t.status === "not_required") return t;
    const due = dueKey(t.dueDate);
    if (!due) return t;
    if (!taskAlertAudience(t)) return t;
    if (due === today) {
      if (t.dueTodayNotifiedFor === due) return t;
      hits.push({ taskId: t.id, which: "due_today", due });
      return { ...t, dueTodayNotifiedFor: due };
    }
    if (due < today) {
      if (t.overdueNotifiedFor === due) return t;
      hits.push({ taskId: t.id, which: "overdue", due });
      return { ...t, overdueNotifiedFor: due };
    }
    return t;
  });
  return { tasks: next, hits };
}
