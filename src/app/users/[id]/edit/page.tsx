import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserForm } from "@/components/user-form";
import { AccessEditor } from "@/components/access-editor";
import type { UserRow } from "@/components/user-management";
import { clearanceFromDb } from "@/lib/clearance";
import { parseAccess, storedUsersLevel } from "@/lib/access";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.access?.users !== "edit") redirect("/");

  const { id } = await params;
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      clearance: true,
      department: true,
      secondDepartment: true,
      mustChangePassword: true,
      createdAt: true,
      access: true,
    },
  });
  if (!u) notFound();

  const masters = await prisma.user.findMany({
    where: { clearance: "MASTER" },
    select: { id: true, access: true },
  });
  const role = clearanceFromDb(u.clearance);
  const initial = parseAccess(u.access, role, u.department).map;
  const otherMastersOnEdit = masters.filter(
    (master) =>
      master.id !== u.id && storedUsersLevel(master.access, "master") === "edit"
  ).length;

  const existing: UserRow = {
    id: u.id,
    name: u.name,
    email: u.email,
    clearance: u.clearance,
    department: u.department,
    secondDepartment: u.secondDepartment,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Edit user
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-muted)]">{existing.email}</p>
      </div>
      <UserForm existing={existing} />
      <AccessEditor
        userId={u.id}
        initial={initial}
        role={role}
        masterCount={masters.length}
        otherMastersOnEdit={otherMastersOnEdit}
      />
    </div>
  );
}
