import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditExecution } from "@/lib/types";
import { mayMutate, parseAccess } from "@/lib/access";
import { clearanceFromDb } from "@/lib/clearance";
import { ReportsLoading } from "../reports-shell";
import ExecutionReportClient from "./execution-client";

export default async function ExecutionReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true, name: true, access: true, clearance: true },
  });

  const parsed = parseAccess(
    dbUser?.access,
    clearanceFromDb(dbUser?.clearance ?? session.user.clearance),
    dbUser?.department
  );
  const canEdit = mayMutate(
    parsed.map.reports_operations,
    canEditExecution({
      clearance: session.user.clearance,
      department: dbUser?.department,
    }),
    parsed.custom
  );
  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return (
    <Suspense fallback={<ReportsLoading />}>
      <ExecutionReportClient canEdit={canEdit} actorName={actorName} />
    </Suspense>
  );
}
