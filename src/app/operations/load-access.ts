import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mayMutate, parseAccess } from "@/lib/access";
import { clearanceFromDb } from "@/lib/clearance";
import {
  canDeleteExpenses,
  canEditExpenses,
  canViewExpenseHistory,
} from "@/lib/types";

/** The Operations menu reuses the expenses door. No new permission is stored. */
export async function loadOperationsAccess() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, access: true, clearance: true, department: true },
  });

  const role = session.user.clearance;
  const parsed = parseAccess(
    dbUser?.access,
    clearanceFromDb(dbUser?.clearance ?? role),
    dbUser?.department
  );
  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return {
    canAdd: parsed.map.expenses === "edit",
    canEdit: mayMutate(
      parsed.map.expenses,
      canEditExpenses(role),
      parsed.custom
    ),
    canDelete: canDeleteExpenses(role),
    canViewHistory: canViewExpenseHistory(role),
    actorName,
  };
}
