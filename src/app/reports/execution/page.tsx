import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ReportsLoading } from "../reports-shell";
import ExecutionReportClient from "./execution-client";

export default async function ExecutionReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { clearance: true },
  });

  const role = (dbUser?.clearance ?? session.user.clearance ?? "").toLowerCase();
  const canRenameItem = role === "master" && session.user.impersonating !== true;

  return (
    <Suspense fallback={<ReportsLoading />}>
      <ExecutionReportClient canRenameItem={canRenameItem} />
    </Suspense>
  );
}
