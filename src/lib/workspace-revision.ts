/**
 * A save is stored only when the row is still the revision that save
 * started from. The comparison is in the SQL predicate, not only in memory.
 */
export const WORKSPACE_REVISION_PREDICATE =
  `COALESCE(("data"->>'workspaceRevision')::int, 0) = $3`;

export function workspaceUpdateSql(): string {
  return `UPDATE "WorkspaceStore"
     SET "data" = $1::jsonb, "updatedAt" = NOW()
     WHERE "id" = $2
       AND ${WORKSPACE_REVISION_PREDICATE}`;
}

export function workspaceInsertIfEmptySql(): string {
  return `INSERT INTO "WorkspaceStore" ("id", "data", "updatedAt")
     SELECT $2, $1::jsonb, NOW()
     WHERE $3 = 0
       AND NOT EXISTS (SELECT 1 FROM "WorkspaceStore" WHERE "id" = $2)`;
}

export function revisionWriteLanded(rowCount: number): boolean {
  return rowCount > 0;
}
