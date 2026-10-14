"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { coerceAccess, type AccessMap } from "@/lib/access";

export async function saveUserAccess(userId: string, raw: AccessMap) {
  const session = await auth();
  if (!session?.user || session.user.impersonating) {
    return { ok: false as const, error: "Only Master can change access." };
  }
  if (session.user.clearance !== "master") {
    return { ok: false as const, error: "Only Master can change access." };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, clearance: true },
  });
  if (!target) return { ok: false as const, error: "User not found." };

  const next = coerceAccess(raw);
  if (target.clearance === "MASTER") {
    next.users = "edit";
    next.home = "view";
  }

  await prisma.user.update({
    where: { id: userId },
    data: { access: next },
  });
  return { ok: true as const };
}
