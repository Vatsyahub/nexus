/**
 * City and state suggestions come from names already stored on contracts.
 * There is no separate directory: a new name is saved only as that contract's
 * city or state, and the next new contract reads it from there.
 */

export type PlaceField = "city" | "state";

type PlaceSource = {
  city?: string | null;
  state?: string | null;
};

/** Distinct saved spellings for one field, blank names omitted. */
export function distinctContractPlaces(
  contracts: readonly PlaceSource[],
  field: PlaceField
): string[] {
  const seen = new Set<string>();
  for (const contract of contracts) {
    const name = String(contract[field] ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
  }
  return [...seen].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/**
 * Saved names that start with what has been typed. The typed text itself is
 * not replaced: an exact saved spelling already in the field is not offered
 * again. A different spelling of the same letters is offered so the saved
 * form can be picked.
 */
export function matchingContractPlaces(
  names: readonly string[],
  typed: string
): string[] {
  const query = typed.trim().toLowerCase();
  if (!query) return [];
  const exact = typed.trim();
  return names
    .filter((name) => name !== exact && name.toLowerCase().startsWith(query))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Enter chooses a highlighted match while the list is open.
 * Otherwise the create-form handler moves to the next field and does not save.
 */
export function chooseSavedNameOnEnter(
  listOpen: boolean,
  highlighted: boolean
): boolean {
  return listOpen && highlighted;
}
