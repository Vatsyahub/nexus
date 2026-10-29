import { storedResponsible } from "@/lib/task-responsible";
import { TASK_CATALOG, withoutTaskPriority, type Task } from "@/lib/types";
import {
  canConfirmTaskVerification,
  clearanceKey,
  completesImmediately,
  managerOfDepartment,
  sameDepartment,
  type TaskActor,
} from "@/lib/task-notices";

/** Users and managers who can be named on a task. */
export type TaskDirectoryPerson = {
  name: string | null | undefined;
  department?: string | null;
  /** Prisma clearance or session role. Missing means the list is already limited. */
  clearance?: string | null;
};

/** Signed-in person plus the user/manager directory, for a workspace save. */
export type TaskEditContext = {
  actor: TaskActor;
  people: TaskDirectoryPerson[];
};

export const TASK_SAVE_DENIED = "You cannot save changes to this task.";

export const TASK_DEPARTMENT_LOCKED =
  "Department cannot be changed once it is saved.";

export const TASK_DEPARTMENT_SET_DENIED = "You cannot set this department.";

export const TASK_DEPARTMENT_CLEAR_DENIED = "You cannot clear this department.";

export const TASK_DEPARTMENT_SWITCH_DENIED =
  "Clear this department before choosing another.";

export const TASK_PEOPLE_DENIED = "Choose people from this department only.";

export const TASK_DEPARTMENT_BEFORE_PEOPLE =
  "Select a department before naming people.";

export const TASK_READ_ONLY =
  "You can read this. Only Master, Director, this department’s manager, or a person named on it can save.";

export function subtaskUpdateDenied(title: string): string {
  return `You cannot update “${title}”. A subtask follows its own department.`;
}

export function departmentIsSet(
  department: string | null | undefined
): boolean {
  return (department || "").trim().length > 0;
}

function cleanDepartment(value: string | null | undefined): string | null {
  const text = (value || "").trim();
  return text || null;
}

function isSubtask(parentId: string | null | undefined): boolean {
  return (parentId || "").trim().length > 0;
}

function managesDepartment(
  actor: TaskActor,
  department: string | null | undefined
): boolean {
  return managerOfDepartment(actor, department);
}

/**
 * Deadline on a task that already exists. The due date submitted with a new
 * parent task or subtask is kept; this check does not remove it. Master, any
 * Director, a person already named on this task, or the manager of this
 * task’s own department (either department that manager holds). Before a
 * department is saved, a manager is not included. A subtask uses its own
 * department and its own assignees.
 */
export function canEditTaskSchedule(
  actor: TaskActor | null | undefined,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  if (!actor) return false;
  const role = clearanceKey(actor.clearance);
  if (role === "master" || role === "director") return true;
  if (namedOnTask(actor, task)) return true;
  if (!departmentIsSet(task.department)) return false;
  return managerOfDepartment(actor, task.department);
}

/** Master, Director, or any login with manager clearance. */
export function canSetEmptyParentDepartment(actor: TaskActor): boolean {
  const role = clearanceKey(actor.clearance);
  return role === "master" || role === "director" || role === "manager";
}

/**
 * Master, someone named on the subtask, or a manager — and a manager only
 * receives a department they manage, including their second department.
 */
export function departmentsASubtaskMayTake(
  actor: TaskActor,
  assignees: string[] | null | undefined,
  departments: string[]
): string[] {
  if (clearanceKey(actor.clearance) === "master") return departments;
  if (namedOnTask(actor, { assignees })) return departments;
  if (clearanceKey(actor.clearance) !== "manager") return [];
  return departments.filter((name) => managerOfDepartment(actor, name));
}

function canClearSubtaskDepartment(
  actor: TaskActor,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  if (clearanceKey(actor.clearance) === "master") return true;
  if (managesDepartment(actor, task.department)) return true;
  return namedOnTask(actor, task);
}

export type TaskDepartmentDecision =
  | { ok: true; department: string | null }
  | { ok: false; error: string };

/**
 * Parent (no parent id): an empty department can be set by Master, Director,
 * or a manager. After it is saved, every login is locked, including Master.
 * Subtask: empty can be set by Master, a manager of the department being
 * chosen, or someone named on that subtask. Director is not enough unless
 * they are that manager or named there. A set department can be cleared by
 * Master, that department’s manager, or someone named on the subtask.
 * It cannot move from one department to another in the same save.
 * Assignees are this task’s own names, not a parent’s.
 */
export function resolveTaskDepartment(input: {
  parentId?: string | null;
  currentDepartment: string | null | undefined;
  nextDepartment: string | null | undefined;
  assignees?: string[] | null;
  actor: TaskActor;
}): TaskDepartmentDecision {
  const current = cleanDepartment(input.currentDepartment);
  const next = cleanDepartment(input.nextDepartment);
  if (!current && !next) return { ok: true, department: null };
  if (current && next && sameDepartment(current, next)) {
    return { ok: true, department: current };
  }

  if (!isSubtask(input.parentId)) {
    if (current) return { ok: false, error: TASK_DEPARTMENT_LOCKED };
    if (!canSetEmptyParentDepartment(input.actor)) {
      return { ok: false, error: TASK_DEPARTMENT_SET_DENIED };
    }
    return { ok: true, department: next };
  }

  if (current && next) {
    return { ok: false, error: TASK_DEPARTMENT_SWITCH_DENIED };
  }
  if (current && !next) {
    if (
      !canClearSubtaskDepartment(input.actor, {
        department: current,
        assignees: input.assignees,
      })
    ) {
      return { ok: false, error: TASK_DEPARTMENT_CLEAR_DENIED };
    }
    return { ok: true, department: null };
  }
  if (clearanceKey(input.actor.clearance) === "master") {
    return { ok: true, department: next };
  }
  if (managesDepartment(input.actor, next)) {
    return { ok: true, department: next };
  }
  if (namedOnTask(input.actor, { assignees: input.assignees })) {
    return { ok: true, department: next };
  }
  return { ok: false, error: TASK_DEPARTMENT_SET_DENIED };
}

export type TaskDepartmentControl =
  | { kind: "fixed"; department: string | null }
  | { kind: "choose"; options: string[] }
  | { kind: "clear"; department: string };

/** What the task screen may offer. View-only is fixed. */
export function taskDepartmentControl(
  actor: TaskActor,
  task: {
    parentId?: string | null;
    department?: string | null;
    assignees?: string[] | null;
  },
  departments: string[],
  canEdit = true
): TaskDepartmentControl {
  const current = cleanDepartment(task.department);
  if (!canEdit) return { kind: "fixed", department: current };
  if (!isSubtask(task.parentId)) {
    if (current) return { kind: "fixed", department: current };
    if (!canSetEmptyParentDepartment(actor)) {
      return { kind: "fixed", department: null };
    }
    return { kind: "choose", options: departments };
  }
  if (current) {
    if (
      canClearSubtaskDepartment(actor, {
        department: current,
        assignees: task.assignees,
      })
    ) {
      return { kind: "clear", department: current };
    }
    return { kind: "fixed", department: current };
  }
  const options = departmentsASubtaskMayTake(actor, task.assignees, departments);
  if (options.length === 0) return { kind: "fixed", department: null };
  return { kind: "choose", options };
}

export function namedOnTask(
  actor: TaskActor,
  task: { assignees?: string[] | null }
): boolean {
  const name = (actor.name || "").trim().toLowerCase();
  if (!name) return false;
  return (task.assignees ?? []).some(
    (item) => item.trim().toLowerCase() === name
  );
}

function isAssignablePerson(person: TaskDirectoryPerson): boolean {
  if (!person.clearance) return true;
  const role = clearanceKey(person.clearance);
  return role === "user" || role === "manager";
}

/**
 * Users and managers whose own department matches the one selected on the task.
 * A manager’s second department does not put them on that task’s name list.
 */
export function peopleNamedInDepartment<T extends TaskDirectoryPerson>(
  people: T[],
  department: string | null | undefined
): T[] {
  if (!departmentIsSet(department)) return [];
  return people.filter(
    (person) =>
      Boolean((person.name || "").trim()) &&
      isAssignablePerson(person) &&
      sameDepartment(person.department, department)
  );
}

/**
 * Master and Director can update any task.
 * A task with a department can also be updated by a manager of that
 * department (either of the manager’s departments) and by a person named
 * on that same task. The parent’s department is not used.
 * While the department is empty, anyone who can open the task can still edit
 * other fields. Setting the department follows resolveTaskDepartment.
 */
export function canUpdateTask(
  actor: TaskActor,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  const role = clearanceKey(actor.clearance);
  if (role === "master" || role === "director") return true;
  if (!departmentIsSet(task.department)) return true;
  if (managerOfDepartment(actor, task.department)) return true;
  return namedOnTask(actor, task);
}

function nameKey(value: string): string {
  return value.trim().toLowerCase();
}

function cleanNames(names: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names ?? []) {
    const trimmed = name.trim();
    const key = nameKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function sameNameSet(a: string[], b: string[]): boolean {
  const left = a.map(nameKey).sort();
  const right = b.map(nameKey).sort();
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * Names must be users or managers in the task’s department.
 * People already named stay if the department was already saved.
 * A newly chosen department drops anyone from another department.
 */
export function resolveTaskAssignees(input: {
  currentDepartment: string | null | undefined;
  nextDepartment: string | null | undefined;
  currentAssignees: string[] | null | undefined;
  nextAssignees: string[] | null | undefined;
  people: TaskDirectoryPerson[];
}): { ok: true; assignees: string[] } | { ok: false; error: string } {
  const department = departmentIsSet(input.currentDepartment)
    ? (input.currentDepartment || "").trim()
    : (input.nextDepartment || "").trim();
  const current = cleanNames(input.currentAssignees);
  const next = cleanNames(input.nextAssignees);
  if (!departmentIsSet(department)) {
    if (!sameNameSet(current, next) && next.length > 0) {
      return { ok: false, error: TASK_DEPARTMENT_BEFORE_PEOPLE };
    }
    return { ok: true, assignees: sameNameSet(current, next) ? current : next };
  }
  const allowed = new Set(
    peopleNamedInDepartment(input.people, department).map((person) =>
      nameKey(person.name || "")
    )
  );
  const previous = new Set(current.map(nameKey));
  const alreadySet = departmentIsSet(input.currentDepartment);
  const assignees: string[] = [];
  for (const name of next) {
    const key = nameKey(name);
    const inDepartment = allowed.has(key);
    const grandfathered = alreadySet && previous.has(key);
    if (inDepartment || grandfathered) {
      assignees.push(name);
      continue;
    }
    if (!previous.has(key)) {
      return { ok: false, error: TASK_PEOPLE_DENIED };
    }
  }
  return { ok: true, assignees };
}

/** Server-side twin of resolveTaskAssignees. Illegal names are left off. */
export function coerceTaskAssignees(input: {
  currentDepartment: string | null | undefined;
  nextDepartment: string | null | undefined;
  currentAssignees: string[] | null | undefined;
  nextAssignees: string[] | null | undefined;
  people: TaskDirectoryPerson[];
}): string[] {
  const resolved = resolveTaskAssignees(input);
  if (resolved.ok) return resolved.assignees;
  const department = departmentIsSet(input.currentDepartment)
    ? (input.currentDepartment || "").trim()
    : (input.nextDepartment || "").trim();
  if (!departmentIsSet(department)) return cleanNames(input.currentAssignees);
  const allowed = new Set(
    peopleNamedInDepartment(input.people, department).map((person) =>
      nameKey(person.name || "")
    )
  );
  const previous = new Set(cleanNames(input.currentAssignees).map(nameKey));
  const alreadySet = departmentIsSet(input.currentDepartment);
  return cleanNames(input.nextAssignees).filter((name) => {
    const key = nameKey(name);
    return allowed.has(key) || (alreadySet && previous.has(key));
  });
}

function restoreEditableFields(prev: Task, next: Task): Task {
  return {
    ...next,
    title: prev.title,
    contractId: prev.contractId,
    department: prev.department,
    assignees: prev.assignees,
    responsible: prev.responsible ?? null,
    status: prev.status,
    dueDate: prev.dueDate,
    parentId: prev.parentId,
    source: prev.source,
    catalogKey: prev.catalogKey,
    notes: prev.notes,
    notesUpdatedAt: prev.notesUpdatedAt,
    completedAt: prev.completedAt,
    notRequiredReason: prev.notRequiredReason,
    verificationDepartment: prev.verificationDepartment,
    verificationRequestedBy: prev.verificationRequestedBy,
    createdAt: prev.createdAt,
  };
}

function acceptedDepartment(prev: Task, next: Task, actor: TaskActor): string | null {
  const decision = resolveTaskDepartment({
    parentId: prev.parentId,
    currentDepartment: prev.department,
    nextDepartment: next.department,
    assignees: prev.assignees,
    actor,
  });
  if (!decision.ok) {
    return departmentIsSet(prev.department) ? prev.department : null;
  }
  return decision.department;
}

function isAppSystemTask(task: Pick<Task, "source" | "catalogKey" | "parentId">): boolean {
  if (task.source !== "system" || isSubtask(task.parentId)) return false;
  return TASK_CATALOG.some((item) => item.system && item.key === task.catalogKey);
}

function withAllowedEdits(
  prev: Task,
  next: Task,
  actor: TaskActor,
  people: TaskDirectoryPerson[]
): Task {
  const department = acceptedDepartment(prev, next, actor);
  const assignees = coerceTaskAssignees({
    currentDepartment: prev.department,
    nextDepartment: department,
    currentAssignees: prev.assignees,
    nextAssignees: next.assignees,
    people,
  });
  const responsible = storedResponsible(
    assignees,
    next.responsible === undefined ? prev.responsible : next.responsible
  );
  return settleTaskCompletion(
    prev,
    { ...next, department, assignees, responsible },
    actor
  );
}

function finishTaskNow(next: Task): Task {
  return {
    ...next,
    status: "completed",
    completedAt: next.completedAt || new Date().toISOString(),
    notRequiredReason: null,
    verificationDepartment: null,
    verificationRequestedBy: null,
  };
}

function parkTaskForVerification(next: Task, actor: TaskActor, prev?: Task): Task {
  const already = prev?.status === "awaiting_verification";
  return {
    ...next,
    status: "awaiting_verification",
    completedAt: null,
    notRequiredReason: null,
    verificationDepartment: already
      ? (prev?.verificationDepartment ?? null)
      : (actor.department || "").trim() || null,
    verificationRequestedBy: already
      ? (prev?.verificationRequestedBy ?? null)
      : (actor.name || "").trim() || null,
  };
}

/**
 * A subtask marked completed finishes now. It does not enter
 * awaiting_verification. A subtask already waiting stays waiting until
 * the confirm path, or until someone marks it completed.
 * A parent still waits when a user marks it completed. Manager, Director,
 * and Master finish a parent immediately.
 */
function settleTaskCompletion(prev: Task, next: Task, actor: TaskActor): Task {
  const subtask = isSubtask(prev.parentId);
  const wantsCompleted = next.status === "completed";
  const wantsWaiting = next.status === "awaiting_verification";
  if (!wantsCompleted && !wantsWaiting) return next;

  if (subtask) {
    if (wantsWaiting && prev.status === "awaiting_verification") {
      return parkTaskForVerification(next, actor, prev);
    }
    return finishTaskNow(next);
  }

  if (prev.status === "completed" || prev.status === "not_required") return next;

  if (wantsWaiting && prev.status === "awaiting_verification") {
    return parkTaskForVerification(next, actor, prev);
  }

  if (
    prev.status === "awaiting_verification" &&
    wantsCompleted &&
    canConfirmTaskVerification(actor, prev)
  ) {
    return finishTaskNow(next);
  }

  if (completesImmediately(actor.clearance)) return finishTaskNow(next);

  if (prev.status === "awaiting_verification" && wantsCompleted) {
    return parkTaskForVerification(next, actor, prev);
  }

  return parkTaskForVerification(next, actor);
}

function sanitizeNewTask(
  next: Task,
  actor: TaskActor,
  people: TaskDirectoryPerson[]
): Task {
  let department: string | null;
  if (isAppSystemTask(next)) {
    department = cleanDepartment(next.department);
  } else {
    const decision = resolveTaskDepartment({
      parentId: next.parentId,
      currentDepartment: null,
      nextDepartment: next.department,
      assignees: [],
      actor,
    });
    department = decision.ok ? decision.department : null;
  }
  const assignees = coerceTaskAssignees({
    currentDepartment: null,
    nextDepartment: department,
    currentAssignees: [],
    nextAssignees: next.assignees,
    people,
  });
  // The due date is the one the creator submitted.
  const drafted: Task = {
    ...next,
    department,
    assignees,
    responsible: storedResponsible(assignees, next.responsible),
    dueDate: next.dueDate,
  };
  return settleTaskCompletion(
    { ...drafted, status: "pending", completedAt: null },
    drafted,
    actor
  );
}

/**
 * A person who cannot update the task can still confirm a completion that
 * is waiting for their department, or for Master. Nothing else on the row changes.
 */
function acceptVerificationConfirm(prev: Task, next: Task): Task {
  return {
    ...restoreEditableFields(prev, next),
    status: "completed",
    completedAt: next.completedAt || prev.completedAt || new Date().toISOString(),
    notRequiredReason: null,
    verificationDepartment: null,
    verificationRequestedBy: null,
  };
}

/**
 * Keep task edits the signed-in person is allowed to store.
 * Each row uses its own department and its own assignees.
 * A parent department, once saved, is not replaced. A subtask department
 * follows resolveTaskDepartment, so a crafted save cannot switch it.
 * Due-notice markers can still move on a row the person cannot edit.
 */
export function applyTaskEditPolicy(
  current: Task[],
  incoming: Task[],
  actor: TaskActor,
  people: TaskDirectoryPerson[]
): Task[] {
  const currentById = new Map(current.map((task) => [task.id, task]));
  return incoming.flatMap((next) => {
    const prev = currentById.get(next.id);
    if (!prev) {
      if (isSubtask(next.parentId)) {
        const parent =
          currentById.get(next.parentId || "") ??
          incoming.find((row) => row.id === next.parentId);
        if (parent && isSubtask(parent.parentId)) return [];
      }
      return [sanitizeNewTask(next, actor, people)];
    }
    if (!canUpdateTask(actor, prev)) {
      if (
        next.status === "completed" &&
        canConfirmTaskVerification(actor, prev)
      ) {
        return [acceptVerificationConfirm(prev, next)];
      }
      return [restoreEditableFields(prev, next)];
    }
    return [withAllowedEdits(prev, next, actor, people)];
  }).map(withoutTaskPriority);
}
