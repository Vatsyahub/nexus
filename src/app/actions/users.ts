"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import {
  departmentsAfterRename,
  resolveUserDepartments,
} from "@/lib/user-departments";
import { prisma } from "@/lib/prisma";

const clearanceSchema = z.enum(["USER", "MANAGER", "DIRECTOR", "MASTER"]);

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  clearance: clearanceSchema,
  department: z.string().trim().optional(),
  secondDepartment: z.string().trim().optional(),
  tempPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters"),
});

const editSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  clearance: clearanceSchema,
  department: z.string().trim().optional(),
  secondDepartment: z.string().trim().optional(),
});

const resetSchema = z.object({
  userId: z.string().min(1),
  tempPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters"),
});

export type UserActionState = {
  ok?: boolean;
  error?: string;
  createdEmail?: string;
};

async function requireMaster() {
  const session = await auth();
  if (!session?.user?.id || session.user.access?.users !== "edit") {
    return null;
  }
  return session;
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await requireMaster();
  if (!session) return { error: "Only Master can create users." };

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    clearance: formData.get("clearance"),
    department: formData.get("department") || undefined,
    secondDepartment: formData.get("secondDepartment") || undefined,
    tempPassword: formData.get("tempPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const dept = resolveUserDepartments(
    parsed.data.clearance,
    parsed.data.department,
    parsed.data.secondDepartment
  );
  if (dept.error) return { error: dept.error };

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "That email is already registered." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 12);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      clearance: parsed.data.clearance,
      department: dept.department,
      secondDepartment: dept.secondDepartment,
      passwordHash,
      mustChangePassword: true,
    },
  });

  revalidatePath("/users");
  revalidatePath("/users/departments");
  return { ok: true, createdEmail: email };
}

export async function updateUser(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await requireMaster();
  if (!session) return { error: "Only Master can edit users." };

  const parsed = editSchema.safeParse({
    userId: formData.get("userId"),
    name: formData.get("name"),
    email: formData.get("email"),
    clearance: formData.get("clearance"),
    department: formData.get("department") || undefined,
    secondDepartment: formData.get("secondDepartment") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const dept = resolveUserDepartments(
    parsed.data.clearance,
    parsed.data.department,
    parsed.data.secondDepartment
  );
  if (dept.error) return { error: dept.error };

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.user.findUnique({ where: { email } });
  if (clash && clash.id !== parsed.data.userId) {
    return { error: "That email is already registered." };
  }

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: {
      name: parsed.data.name,
      email,
      clearance: parsed.data.clearance,
      department: dept.department,
      secondDepartment: dept.secondDepartment,
    },
  });

  revalidatePath("/users");
  revalidatePath("/users/departments");
  revalidatePath(`/users/${parsed.data.userId}/edit`);
  return { ok: true, createdEmail: email };
}

export async function deleteUser(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await requireMaster();
  if (!session) return { error: "Only Master can delete users." };

  const userId = String(formData.get("userId") || "");
  if (!userId) return { error: "User not found." };
  if (userId === session.user.id) {
    return { error: "You cannot delete your own account." };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found." };

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/users");
  revalidatePath("/users/departments");
  return { ok: true, createdEmail: user.email };
}

/**
 * Move every person stored on `from` to `to`, or clear that department when `to` is null.
 * The first department changes only when it matches. The second department changes
 * only when it matches, so one rename does not rewrite the other.
 */
export async function reassignDepartmentMembers(
  from: string,
  to: string | null
): Promise<UserActionState> {
  const session = await requireMaster();
  if (!session) return { error: "Only Master can edit users." };

  const fromName = from.trim();
  if (!fromName) return { error: "Enter a department name." };
  const next = to === null ? null : to.trim();
  if (next === "") return { error: "Enter a department name." };
  if (next === fromName) return { ok: true };

  const rows = await prisma.user.findMany({
    select: { id: true, department: true, secondDepartment: true },
  });
  const primaryIds: string[] = [];
  const secondIds: string[] = [];
  for (const row of rows) {
    const updated = departmentsAfterRename(row, fromName, next);
    if (updated.department !== row.department) primaryIds.push(row.id);
    if (updated.secondDepartment !== row.secondDepartment) secondIds.push(row.id);
  }
  if (primaryIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: primaryIds } },
      data: { department: next },
    });
  }
  if (secondIds.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: secondIds } },
      data: { secondDepartment: next },
    });
  }

  revalidatePath("/users");
  revalidatePath("/users/departments");
  return { ok: true };
}

export async function resetUserPassword(
  _prev: UserActionState,
  formData: FormData
): Promise<UserActionState> {
  const session = await requireMaster();
  if (!session) return { error: "Only Master can reset passwords." };

  const parsed = resetSchema.safeParse({
    userId: formData.get("userId"),
    tempPassword: formData.get("tempPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.userId === session.user.id) {
    return {
      error: "Use Settings → Change password for your own account.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!user) return { error: "User not found." };

  const passwordHash = await bcrypt.hash(parsed.data.tempPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: true },
  });

  revalidatePath("/users");
  return { ok: true, createdEmail: user.email };
}
