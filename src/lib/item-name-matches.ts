/**
 * Item-name search shared by every BOQ item box.
 * The name is split on spaces and hyphens. A match is a word that starts
 * with the typed text, ignoring case. An empty query matches nothing.
 * At most ITEM_NAME_MATCH_LIMIT names are returned, in the order given.
 */

export const ITEM_NAME_MATCH_LIMIT = 5;

function itemNameWords(name: string): string[] {
  return name.split(/[\s-]+/).filter((word) => word.length > 0);
}

export function matchingItemNames<T extends { name: string }>(
  items: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const hits: T[] = [];
  for (const item of items) {
    const matched = itemNameWords(item.name).some((word) =>
      word.toLowerCase().startsWith(needle)
    );
    if (!matched) continue;
    hits.push(item);
    if (hits.length === ITEM_NAME_MATCH_LIMIT) break;
  }
  return hits;
}
