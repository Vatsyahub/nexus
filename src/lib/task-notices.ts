import type { HubNotification, Task } from "@/lib/types";


/** Signed-in person, as the bell and task screen already know them. */
export type NoticeViewer = {
  name: string | null | undefined;
  department: string | null | undefined;
  /** Session role or Prisma clearance. Compared case-insensitively. */
  clearance?: string | null;
};

/** Person who is marking a task completed or confirming one. */
export type TaskActor = {
  name?: string | null;
  clearance?: string | null;
  department?: string | null;
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
 * Due-today warning: named assignees and the managers of the task's
 * department. One row covers both, so a person who is an assignee and a
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
 * department. A row may set both (due-today): either audience sees the
 * one notice. audienceClearance "master" is the no-department fallback.
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
    if (clearanceKey(user.clearance) !== "manager") return false;
    return sameDepartment(user.department, n.audienceDepartment);
  }
  return false;
}

/** Department manager for the waiting user's department, or Master for any. */
export function canConfirmTaskVerification(
  actor: TaskActor,
  task: Pick<Task, "status" | "verificationDepartment">
): boolean {
  if (task.status !== "awaiting_verification") return false;
  const role = clearanceKey(actor.clearance);
  if (role === "master") return true;
  if (role !== "manager") return false;
  return sameDepartment(actor.department, task.verificationDepartment);
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
