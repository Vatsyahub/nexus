"use server";

import { auth } from "@/auth";
import { clearanceFromDb } from "@/lib/clearance";
import { prisma } from "@/lib/prisma";
import { resolveUserAccessSave, type AccessMap } from "@/lib/access";

/** Serializes access saves so two of them cannot drop the last Edit. */
const ACCESS_SAVE_LOCK = 872341;

export async function saveUserAccess(userId: string, raw: AccessMap) {
  const session = await auth();
  if (!session?.user || session.user.impersonating) {
    return { ok: false as const, error: "Only Master can change access." };
  }
  if (session.user.clearance !== "master") {
    return { ok: false as const, error: "Only Master can change access." };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${ACCESS_SAVE_LOCK})`);

    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, clearance: true, access: true },
    });
    if (!target) return { ok: false as const, error: "User not found." };

    const masters = await tx.user.findMany({
      where: { clearance: "MASTER" },
      select: { id: true, access: true },
    });

    const decision = resolveUserAccessSave(
      raw,
      {
        id: target.id,
        role: clearanceFromDb(target.clearance),
        access: target.access,
      },
      masters
    );
    if (!decision.ok) return { ok: false as const, error: decision.error };

    await tx.user.update({
      where: { id: userId },
      data: { access: decision.map },
    });
    return { ok: true as const };
  });
}
