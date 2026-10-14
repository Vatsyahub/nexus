import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  canDeleteExpenses,
  canEditExpenses,
  canViewExpenseHistory,
} from "@/lib/types";
import { mayMutate, parseAccess } from "@/lib/access";
import { clearanceFromDb } from "@/lib/clearance";
import { ExpensesClient } from "./expenses-client";

export default async function ExpensesPage() {
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
  const canChange = parsed.map.expenses === "edit";
  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return (
    <ExpensesClient
      canAdd={canChange}
      canEdit={mayMutate(parsed.map.expenses, canEditExpenses(role), parsed.custom)}
      canDelete={canDeleteExpenses(role)}
      canViewHistory={canViewExpenseHistory(role)}
      actorName={actorName}
    />
  );
}
