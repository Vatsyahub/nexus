/**
 * Contract choices on add screens. An empty query is not a search.
 * Prefix matches on the project number or name come before contains matches.
 */

type ContractQueryFields = {
  projectNo: string;
  projectName: string;
};

export const ADD_CONTRACT_MATCH_LIMIT = 3;

export function matchingAddContracts<T extends ContractQueryFields>(
  contracts: readonly T[],
  query: string,
  limit = ADD_CONTRACT_MATCH_LIMIT
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle || limit <= 0) return [];

  const starts: T[] = [];
  const contains: T[] = [];
  for (const contract of contracts) {
    const projectNo = contract.projectNo.toLowerCase();
    const projectName = contract.projectName.toLowerCase();
    if (projectNo.startsWith(needle) || projectName.startsWith(needle)) {
      starts.push(contract);
    } else if (projectNo.includes(needle) || projectName.includes(needle)) {
      contains.push(contract);
    }
  }
  return [...starts, ...contains].slice(0, limit);
}
