import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ClearanceRole } from "@/lib/clearance";
import type { AssignablePerson } from "../tasks-client";
import { NewTaskClient } from "./new-task-client";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const raw = params.contractId;
  const contractId = typeof raw === "string" ? raw : "";

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

  return (
    <NewTaskClient
      people={people}
      role={role}
      defaultContractId={contractId}
    />
  );
}
