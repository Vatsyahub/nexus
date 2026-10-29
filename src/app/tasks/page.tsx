import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ClearanceRole } from "@/lib/clearance";
import TasksClient from "./tasks-client";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = (session.user.clearance ?? "user") as ClearanceRole;
  const currentUserName = session.user.name?.trim() || "";
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { department: true, secondDepartment: true },
  });

  return (
    <TasksClient
      role={role}
      currentUserName={currentUserName}
      currentUserDepartment={me?.department ?? null}
      currentUserSecondDepartment={me?.secondDepartment ?? null}
    />
  );
}
