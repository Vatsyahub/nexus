import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseAccess } from "@/lib/access";
import { clearanceFromDb } from "@/lib/clearance";
import { NewExpenseClient } from "./new-expense-client";

export default async function NewExpensePage() {
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
  if (parsed.map.expenses !== "edit") redirect("/expenses");

  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return <NewExpenseClient actorName={actorName} />;
}
