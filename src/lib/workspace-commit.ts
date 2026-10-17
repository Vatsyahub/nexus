import { prisma } from "@/lib/prisma";
import type { FlowhubData } from "@/lib/types";
import {
  revisionWriteLanded,
  workspaceInsertIfEmptySql,
  workspaceUpdateSql,
} from "@/lib/workspace-revision";

const STORE_ID = "default";

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";
  if (code === "P2002" || code === "23505") return true;
  const message = err instanceof Error ? err.message : "";
  return /23505|unique constraint/i.test(message);
}

/**
 * Write the hub only when its stored revision is still `expectedRevision`.
 * Returns how many rows were written. Zero means the revision moved.
 */
export async function writeWorkspaceIfRevision(
  data: FlowhubData,
  expectedRevision: number
): Promise<number> {
  const payload = JSON.stringify(data);
  const updated = await prisma.$executeRawUnsafe(
    workspaceUpdateSql(),
    payload,
    STORE_ID,
    expectedRevision
  );
  if (revisionWriteLanded(updated)) return updated;
  if (expectedRevision !== 0) return 0;
  try {
    return await prisma.$executeRawUnsafe(
      workspaceInsertIfEmptySql(),
      payload,
      STORE_ID,
      expectedRevision
    );
  } catch (err) {
    if (isUniqueViolation(err)) return 0;
    throw err;
  }
}
