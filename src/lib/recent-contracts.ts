/**
 * Home “Recent contracts”: the contracts most recently added to the hub.
 * Sort is createdAt newest first. Closure date is not read.
 */
export function recentContracts<T extends { createdAt: string }>(
  contracts: readonly T[],
  limit = 3
): T[] {
  return contracts
    .slice()
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return 0;
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);
}
