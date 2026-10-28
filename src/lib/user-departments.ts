import { clearanceKey, sameDepartment } from "@/lib/task-notices";

export type StoredDepartments = {
  department: string | null;
  secondDepartment: string | null;
};

function clean(value: string | null | undefined): string | null {
  const text = (value || "").trim();
  return text || null;
}

/**
 * Departments stored on a user.
 * A User, Director, or Master keeps at most the first department. A second
 * department sent for those clearances is dropped.
 * A Manager must have the first department and may add a different second
 * one. An empty second department means they manage one department. Adding
 * the second does not rewrite the first.
 */
export function resolveUserDepartments(
  clearance: string | null | undefined,
  department?: string | null,
  secondDepartment?: string | null
): StoredDepartments & { error?: string } {
  const primary = clean(department);
  const role = clearanceKey(clearance);
  if ((role === "user" || role === "manager") && !primary) {
    return {
      error: "Department is required for Users and Managers.",
      department: null,
      secondDepartment: null,
    };
  }
  if (role !== "manager") {
    return { department: primary, secondDepartment: null };
  }
  const second = clean(secondDepartment);
  if (second && sameDepartment(primary, second)) {
    return {
      error: "Choose two different departments.",
      department: null,
      secondDepartment: null,
    };
  }
  return { department: primary, secondDepartment: second };
}

/**
 * Rename or clear one department name on a person.
 * The first department changes only when it is the department being renamed.
 * The second department changes only when it is the one being renamed.
 */
export function departmentsAfterRename(
  row: StoredDepartments,
  from: string,
  to: string | null
): StoredDepartments {
  const next = to === null ? null : clean(to);
  return {
    department: sameDepartment(row.department, from) ? next : row.department,
    secondDepartment: sameDepartment(row.secondDepartment, from)
      ? next
      : row.secondDepartment,
  };
}

/** Both departments, in stored order, when each is set. */
export function formatUserDepartments(
  department: string | null | undefined,
  secondDepartment: string | null | undefined
): string {
  return [clean(department), clean(secondDepartment)]
    .filter((name): name is string => Boolean(name))
    .join(", ");
}
