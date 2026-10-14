"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clearanceFromDb } from "@/lib/clearance";
import { masterRecoveryMatches } from "@/lib/master-recovery";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "New password and confirmation do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordState = {
  ok?: boolean;
  error?: string;
};

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in." };
  }

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return { error: "User not found." };

  const passwordOk = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash
  );
  const recoveryOk =
    !passwordOk &&
    clearanceFromDb(user.clearance) === "master" &&
    masterRecoveryMatches(parsed.data.currentPassword);
  if (!passwordOk && !recoveryOk) {
    return { error: "Current password is wrong." };
  }
  if (masterRecoveryMatches(parsed.data.newPassword)) {
    return { error: "Choose a password that is not the recovery passcode." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  return { ok: true };
}
