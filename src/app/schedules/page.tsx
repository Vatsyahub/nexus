import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditSchedules } from "@/lib/schedule-permissions";
import { parseAccess } from "@/lib/access";
import { clearanceFromDb } from "@/lib/clearance";
import SchedulesClient from "./schedules-client";

export default async function SchedulesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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
  const isMaster = clearance === "master";
  const actorName =
    dbUser?.name?.trim() ||
    session.user.name?.trim() ||
    session.user.email ||
    "User";

  return (
    <SchedulesClient
      canEdit={canEdit}
      isMaster={isMaster}
      actorName={actorName}
    />
  );
}
