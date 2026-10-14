import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UsersClient } from "./users-client";
import type { UserRow } from "@/components/user-management";

export default async function UsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.access?.users !== "edit") redirect("/");

  const rows = await prisma.user.findMany({
    orderBy: [{ clearance: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      clearance: true,
      department: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });

  const users: UserRow[] = rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    clearance: u.clearance,
    department: u.department,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt.toISOString(),
  }));

  return <UsersClient users={users} currentUserId={session.user.id} />;
}
