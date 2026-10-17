import type { Task } from "@/lib/types";
import {
  canConfirmTaskVerification,
  clearanceKey,
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

/** A saved department stays. An empty one can be chosen once. */
export function departmentChangeAllowed(
  current: string | null | undefined,
  next: string | null | undefined
): boolean {
  if (!departmentIsSet(current)) return true;
  return sameDepartment(current, next);
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

/** Users and managers whose department matches the one selected on the task. */
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
 * A task with a department can also be updated by that department’s manager
 * and by a person named on that same task. The parent’s department is not used.
 * While the department is empty, anyone who can open the task can still edit
 * it, including setting the department once.
 */
export function canUpdateTask(
  actor: TaskActor,
  task: { department?: string | null; assignees?: string[] | null }
): boolean {
  const role = clearanceKey(actor.clearance);
  if (role === "master" || role === "director") return true;
  if (!departmentIsSet(task.department)) return true;
  if (role === "manager" && sameDepartment(actor.department, task.department)) {
    return true;
  }
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
    status: prev.status,
    dueDate: prev.dueDate,
    parentId: prev.parentId,
    source: prev.source,
    catalogKey: prev.catalogKey,
    priority: prev.priority,
    notes: prev.notes,
    notesUpdatedAt: prev.notesUpdatedAt,
    completedAt: prev.completedAt,
    notRequiredReason: prev.notRequiredReason,
    verificationDepartment: prev.verificationDepartment,
    verificationRequestedBy: prev.verificationRequestedBy,
    createdAt: prev.createdAt,
  };
}

function savedDepartment(prev: Task, next: Task): string | null {
  if (departmentIsSet(prev.department)) return prev.department;
  const chosen = (next.department || "").trim();
  return chosen || null;
}

function withAllowedEdits(prev: Task, next: Task, people: TaskDirectoryPerson[]): Task {
  const department = savedDepartment(prev, next);
  const assignees = coerceTaskAssignees({
    currentDepartment: prev.department,
    nextDepartment: department,
    currentAssignees: prev.assignees,
    nextAssignees: next.assignees,
    people,
  });
  return { ...next, department, assignees };
}

function sanitizeNewTask(next: Task, people: TaskDirectoryPerson[]): Task {
  const department = (next.department || "").trim() || null;
  const assignees = coerceTaskAssignees({
    currentDepartment: null,
    nextDepartment: department,
    currentAssignees: [],
    nextAssignees: next.assignees,
    people,
  });
  return { ...next, department, assignees };
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
 * Each row uses its own department. A saved department is not replaced.
 * Due-notice markers can still move on a row the person cannot edit.
 */
export function applyTaskEditPolicy(
  current: Task[],
  incoming: Task[],
  actor: TaskActor,
  people: TaskDirectoryPerson[]
): Task[] {
  const currentById = new Map(current.map((task) => [task.id, task]));
  return incoming.map((next) => {
    const prev = currentById.get(next.id);
    if (!prev) return sanitizeNewTask(next, people);
    if (!canUpdateTask(actor, prev)) {
      if (
        next.status === "completed" &&
        canConfirmTaskVerification(actor, prev)
      ) {
        return acceptVerificationConfirm(prev, next);
      }
      return restoreEditableFields(prev, next);
    }
    return withAllowedEdits(prev, next, people);
  });
}
