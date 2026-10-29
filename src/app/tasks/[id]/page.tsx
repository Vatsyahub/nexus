import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { defaultAccess } from "@/lib/access";
import type { ClearanceRole } from "@/lib/clearance";
import type { AssignablePerson } from "../tasks-client";
import { TaskPageClient } from "./task-page-client";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const rows = await prisma.user.findMany({
    where: { clearance: { in: ["USER", "MANAGER"] } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      department: true,
      clearance: true,
    },
  });

  const people: AssignablePerson[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    department: u.department,
    clearance: u.clearance as AssignablePerson["clearance"],
  }));

  const role = (session.user.clearance ?? "user") as ClearanceRole;
  const access = session.user.access ?? defaultAccess(role);
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true, secondDepartment: true },
  });

  return (
    <TaskPageClient
      taskId={id}
      people={people}
      role={role}
      currentUserName={session.user.name?.trim() || ""}
      currentUserDepartment={me?.department ?? null}
      currentUserSecondDepartment={me?.secondDepartment ?? null}
      canDeleteTasks={role === "master" && session.user.impersonating !== true}
      canEditTasks={access.tasks === "edit"}
    />
  );
}
