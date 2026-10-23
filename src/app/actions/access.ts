"use server";

import { auth } from "@/auth";
import { clearanceFromDb } from "@/lib/clearance";
import { prisma } from "@/lib/prisma";
import { resolveUserAccessSave, type AccessMap } from "@/lib/access";

export async function saveUserAccess(userId: string, raw: AccessMap) {
  const session = await auth();
  if (!session?.user || session.user.impersonating) {
    return { ok: false as const, error: "Only Master can change access." };
  }
  if (session.user.clearance !== "master") {
    return { ok: false as const, error: "Only Master can change access." };
  }

  // Read the few Master rows, then update this person. Do not take
  // pg_advisory_xact_lock or open an interactive transaction: that lock
  // waits with no timeout, Prisma cannot cancel the wait, and Save stays
  // on "Saving…".
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, clearance: true, access: true },
  });
  if (!target) return { ok: false as const, error: "User not found." };

  const masters = await prisma.user.findMany({
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

  await prisma.user.update({
    where: { id: userId },
    data: { access: decision.map },
  });
  return { ok: true as const };
}
