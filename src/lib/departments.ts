import { sameDepartment } from "@/lib/task-notices";
import {
  SEED_DEPARTMENTS,
  type FlowhubData,
  type Task,
} from "@/lib/types";

export type DepartmentPerson = {
  department: string | null;
};

export type DepartmentChange<T extends DepartmentPerson> =
  | {
      ok: true;
      data: FlowhubData;
      people: T[];
      from: string;
      to: string | null;
    }
  | { ok: false; error: string };

type CatalogEntry =
  | { kind: "seed"; seed: string; current: string }
  | { kind: "custom"; current: string };

/** Keep built-in renames and deletions when a workspace blob is loaded or saved. */
export function departmentCatalogFields(raw: {
  customDepartments?: readonly string[] | null;
  departmentRenames?: Record<string, string> | null;
  deletedDepartments?: readonly string[] | null;
}): {
  customDepartments: string[];
  departmentRenames: Record<string, string>;
  deletedDepartments: string[];
} {
  const deletedDepartments = SEED_DEPARTMENTS.filter((seed) =>
    (raw.deletedDepartments ?? []).some(
      (name) => name.trim().toLowerCase() === seed.toLowerCase()
    )
  );
  const deleted = new Set(deletedDepartments.map((name) => name.toLowerCase()));
  const departmentRenames: Record<string, string> = {};
  const incoming = raw.departmentRenames ?? {};
  for (const seed of SEED_DEPARTMENTS) {
    if (deleted.has(seed.toLowerCase())) continue;
    const value = renameValue(incoming, seed);
    if (!value || value === seed) continue;
    departmentRenames[seed] = value;
  }
  const customDepartments = (raw.customDepartments ?? [])
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return { customDepartments, departmentRenames, deletedDepartments };
}

function renameValue(
  renames: Record<string, string>,
  seed: string
): string | null {
  const direct = renames[seed];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const key = Object.keys(renames).find(
    (name) => name.trim().toLowerCase() === seed.toLowerCase()
  );
  if (!key) return null;
  const value = renames[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Current name of a built-in, or null when that built-in was deleted. */
export function currentSeedDepartment(
  data: Pick<FlowhubData, "departmentRenames" | "deletedDepartments">,
  seed: string
): string | null {
  const fields = departmentCatalogFields({
    departmentRenames: data.departmentRenames,
    deletedDepartments: data.deletedDepartments,
  });
  const canonical =
    SEED_DEPARTMENTS.find(
      (name) => name.toLowerCase() === seed.trim().toLowerCase()
    ) ?? seed.trim();
  if (!canonical) return null;
  if (fields.deletedDepartments.includes(canonical)) return null;
  return fields.departmentRenames[canonical] ?? canonical;
}

function catalogEntries(data: FlowhubData): CatalogEntry[] {
  const fields = departmentCatalogFields(data);
  const entries: CatalogEntry[] = [];
  for (const seed of SEED_DEPARTMENTS) {
    if (fields.deletedDepartments.includes(seed)) continue;
    entries.push({
      kind: "seed",
      seed,
      current: fields.departmentRenames[seed] ?? seed,
    });
  }
  for (const name of fields.customDepartments) {
    entries.push({ kind: "custom", current: name });
  }
  return entries;
}

/** Built-ins that are still on the list, plus custom departments. */
export function listDepartmentNames(
  data: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const entry of catalogEntries(data as FlowhubData)) {
    const key = entry.current.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(entry.current);
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

function findEntry(data: FlowhubData, name: string): CatalogEntry | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  return (
    catalogEntries(data).find(
      (entry) => entry.current.toLowerCase() === needle
    ) ?? null
  );
}

function withDepartment<T extends DepartmentPerson>(
  rows: T[],
  from: string,
  to: string | null
): T[] {
  return rows.map((row) => {
    if (!sameDepartment(row.department, from)) return row;
    return { ...row, department: to };
  });
}

function duplicateName(
  data: FlowhubData,
  next: string,
  current: string
): boolean {
  // Same case-insensitive match as addCustomDepartment, skipping this department.
  return listDepartmentNames(data).some(
    (name) =>
      name.toLowerCase() === next.toLowerCase() &&
      name.toLowerCase() !== current.toLowerCase()
  );
}

export function renameDepartmentRecords<T extends DepartmentPerson>(
  data: FlowhubData,
  people: T[],
  from: string,
  to: string
): DepartmentChange<T> {
  const trimmed = to.trim();
  if (!trimmed) return { ok: false, error: "Enter a department name." };
  const entry = findEntry(data, from);
  if (!entry) return { ok: false, error: "Department not found." };
  if (duplicateName(data, trimmed, entry.current)) {
    return { ok: false, error: "That department already exists." };
  }
  if (trimmed === entry.current) {
    return {
      ok: true,
      data,
      people,
      from: entry.current,
      to: entry.current,
    };
  }

  const fields = departmentCatalogFields(data);
  let customDepartments = fields.customDepartments;
  const departmentRenames = { ...fields.departmentRenames };
  if (entry.kind === "seed") {
    if (trimmed === entry.seed) delete departmentRenames[entry.seed];
    else departmentRenames[entry.seed] = trimmed;
  } else {
    let replaced = false;
    customDepartments = fields.customDepartments.map((name) => {
      if (!replaced && name === entry.current) {
        replaced = true;
        return trimmed;
      }
      return name;
    });
  }

  return {
    ok: true,
    data: {
      ...data,
      ...departmentCatalogFields({
        customDepartments,
        departmentRenames,
        deletedDepartments: fields.deletedDepartments,
      }),
      tasks: withDepartment(data.tasks ?? [], entry.current, trimmed),
    },
    people: withDepartment(people, entry.current, trimmed),
    from: entry.current,
    to: trimmed,
  };
}

export function deleteDepartmentRecords<T extends DepartmentPerson>(
  data: FlowhubData,
  people: T[],
  name: string
): DepartmentChange<T> {
  const entry = findEntry(data, name);
  if (!entry) return { ok: false, error: "Department not found." };
  const fields = departmentCatalogFields(data);
  let customDepartments = fields.customDepartments;
  const departmentRenames = { ...fields.departmentRenames };
  let deletedDepartments = fields.deletedDepartments;
  if (entry.kind === "seed") {
    deletedDepartments = [...deletedDepartments, entry.seed];
    delete departmentRenames[entry.seed];
  } else {
    customDepartments = customDepartments.filter(
      (item) => item.toLowerCase() !== entry.current.toLowerCase()
    );
  }
  return {
    ok: true,
    data: {
      ...data,
      ...departmentCatalogFields({
        customDepartments,
        departmentRenames,
        deletedDepartments,
      }),
      tasks: withDepartment(data.tasks ?? [], entry.current, null),
    },
    people: withDepartment(people, entry.current, null),
    from: entry.current,
    to: null,
  };
}

type DepartmentAssignment = { from: string; to: string | null };

/** Catalog diff between two blobs. Used when a save must rewrite stored tasks. */
export function departmentCatalogChanges(
  current: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >,
  incoming: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >
): DepartmentAssignment[] {
  const changes: DepartmentAssignment[] = [];
  for (const seed of SEED_DEPARTMENTS) {
    const before = currentSeedDepartment(current, seed);
    const after = currentSeedDepartment(incoming, seed);
    if (before && before !== after) changes.push({ from: before, to: after });
  }
  const beforeCustom = departmentCatalogFields(current).customDepartments;
  const afterCustom = departmentCatalogFields(incoming).customDepartments;
  const removed = [...beforeCustom];
  for (const name of afterCustom) {
    const index = removed.indexOf(name);
    if (index >= 0) removed.splice(index, 1);
  }
  const added = [...afterCustom];
  for (const name of beforeCustom) {
    const index = added.indexOf(name);
    if (index >= 0) added.splice(index, 1);
  }
  if (removed.length === 1 && added.length === 1) {
    changes.push({ from: removed[0], to: added[0] });
  } else {
    for (const name of removed) changes.push({ from: name, to: null });
  }
  return changes;
}

/**
 * Master keeps a department rename or delete, including the departments on
 * tasks. Every other save leaves the department list and those task
 * departments as stored. A task department that did not come from that
 * catalog change is left for the task rules.
 */
export function departmentCatalogOnSave(
  current: Pick<
    FlowhubData,
    "tasks" | "customDepartments" | "departmentRenames" | "deletedDepartments"
  >,
  incoming: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >,
  tasks: Task[],
  master: boolean
): {
  tasks: Task[];
  customDepartments: string[];
  departmentRenames: Record<string, string>;
  deletedDepartments: string[];
} {
  if (master) {
    return {
      tasks: tasksAfterDepartmentCatalogChange(current, incoming, tasks),
      ...departmentCatalogFields(incoming),
    };
  }
  const moves = departmentCatalogChanges(current, incoming);
  const currentById = new Map((current.tasks ?? []).map((task) => [task.id, task]));
  const kept =
    moves.length === 0
      ? tasks
      : tasks.map((task) => {
          const prev = currentById.get(task.id);
          if (!prev) return task;
          const move = moves.find((item) =>
            sameDepartment(prev.department, item.from)
          );
          if (!move) return task;
          const becameTarget =
            move.to === null
              ? !(task.department || "").trim()
              : sameDepartment(task.department, move.to);
          if (!becameTarget) return task;
          return { ...task, department: prev.department };
        });
  return { tasks: kept, ...departmentCatalogFields(current) };
}

export function tasksAfterDepartmentCatalogChange(
  current: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >,
  incoming: Pick<
    FlowhubData,
    "customDepartments" | "departmentRenames" | "deletedDepartments"
  >,
  tasks: Task[]
): Task[] {
  const changes = departmentCatalogChanges(current, incoming);
  if (!changes.length) return tasks;
  return tasks.map((task) => {
    const change = changes.find((item) =>
      sameDepartment(task.department, item.from)
    );
    if (!change || task.department === change.to) return task;
    return { ...task, department: change.to };
  });
}
