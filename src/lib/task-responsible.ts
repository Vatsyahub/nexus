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

/** Keep a stored name only when that person is still named. Notices ignore it. */
export function storedResponsible(
  assignees: string[] | null | undefined,
  requested: string | null | undefined
): string | null {
  const names = cleanNames(assignees);
  const chosen = (requested ?? "").trim();
  if (!chosen) return null;
  return names.find((name) => samePerson(name, chosen)) ?? null;
}
