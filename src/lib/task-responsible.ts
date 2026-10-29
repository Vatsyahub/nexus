import type { Task } from "@/lib/types";

function cleanNames(names: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names ?? []) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function samePerson(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  return left.length > 0 && left === right;
}

/**
 * The one person Overdue notices and My tasks follow.
 * A stored choice wins when that person is still named.
 * Otherwise the first named person is responsible.
 */
export function responsiblePerson(
  task: Pick<Task, "assignees"> & { responsible?: string | null }
): string | null {
  const names = cleanNames(task.assignees);
  const chosen = (task.responsible ?? "").trim();
  if (chosen) {
    const hit = names.find((name) => samePerson(name, chosen));
    if (hit) return hit;
  }
  return names[0] ?? null;
}

/** Keep an explicit responsible person only when they are still named. */
export function storedResponsible(
  assignees: string[] | null | undefined,
  requested: string | null | undefined
): string | null {
  const names = cleanNames(assignees);
  const chosen = (requested ?? "").trim();
  if (!chosen) return null;
  return names.find((name) => samePerson(name, chosen)) ?? null;
}

export function isResponsiblePerson(
  task: Pick<Task, "assignees"> & { responsible?: string | null },
  userName: string | null | undefined
): boolean {
  return samePerson(responsiblePerson(task), userName);
}
