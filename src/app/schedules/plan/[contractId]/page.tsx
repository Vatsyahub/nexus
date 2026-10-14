import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseAccess } from "@/lib/access";
import { canEditSchedules } from "@/lib/schedule-permissions";
import { clearanceFromDb } from "@/lib/clearance";
import { PlanScheduleClient } from "./plan-schedule-client";

export default async function PlanSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ contractId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { contractId } = await params;
  const sp = await searchParams;
  const mode =
    sp.mode === "edit" ? "edit" : sp.mode === "view" ? "view" : "plan";

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true, name: true, access: true, clearance: true },
  });

  const clearance = session.user.clearance;
  const parsed = parseAccess(
    dbUser?.access,
    clearanceFromDb(dbUser?.clearance ?? clearance),
    dbUser?.department
  );
  const canEdit = canEditSchedules({
    clearance,
    accessLevel: parsed.map.schedules,
  });
  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return (
    <PlanScheduleClient
      contractId={contractId}
      mode={mode}
      canEdit={canEdit}
      actorName={actorName}
    />
  );
}
