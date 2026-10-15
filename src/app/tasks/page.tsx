import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ClearanceRole } from "@/lib/clearance";
import TasksClient, { type AssignablePerson } from "./tasks-client";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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
  const currentUserName = session.user.name?.trim() || "";
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true },
  });

  return (
    <TasksClient
      people={people}
      role={role}
      currentUserName={currentUserName}
      currentUserDepartment={me?.department ?? null}
      canDeleteTasks={role === "master" && session.user.impersonating !== true}
    />
  );
}
