import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseAccess } from "@/lib/access";
import { canEditSchedules } from "@/lib/schedule-permissions";
import { clearanceFromDb } from "@/lib/clearance";
import { NewScheduleClient } from "./new-schedule-client";

export default async function NewSchedulePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { access: true, clearance: true, department: true },
  });
  const parsed = parseAccess(
    dbUser?.access,
    clearanceFromDb(dbUser?.clearance ?? session.user.clearance),
    dbUser?.department
  );
  const canEdit = canEditSchedules({
    clearance: session.user.clearance,
    accessLevel: parsed.map.schedules,
  });

  if (!canEdit) redirect("/schedules");

  return <NewScheduleClient />;
}
