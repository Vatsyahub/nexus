"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteUser } from "@/app/actions/users";
import { confirmAction } from "@/components/confirm-panel";
import { UsersTable, type UserRow } from "@/components/user-management";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export function UsersClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const clearance = u.clearance.toLowerCase();
      return (
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        clearance.includes(needle) ||
        (u.department ?? "").toLowerCase().includes(needle) ||
        u.createdAt.toLowerCase().includes(needle)
      );
    });
  }, [users, q]);

  async function onDelete(user: UserRow) {
    if (user.id === currentUserId) return;
    if (
      !(await confirmAction({
        message: `Delete ${user.name} (${user.email})?`,
        action: "Delete",
      }))
    ) {
      return;
    }
    const fd = new FormData();
    fd.set("userId", user.id);
    const res = await deleteUser({}, fd);
    if (res.error) {
      setMsg(res.error);
      return;
    }
    setMsg(`Deleted ${user.email}.`);
    router.refresh();
  }

  return (
    <HubPage className="max-w-5xl">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            User management
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/users/new"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Create user
          </Link>
          <Link
            href="/users/departments"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Departments
          </Link>
        </div>
      </div>

      <Input
        placeholder="Search name, email, department, role…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="max-w-md bg-white"
      />

      {msg && (
        <p className="text-sm text-[var(--fh-steel)]" role="status">
          {msg}
        </p>
      )}

      <HubDataScroll className="overflow-x-auto">
        <UsersTable
          users={filtered}
          currentUserId={currentUserId}
          onDelete={onDelete}
        />
      </HubDataScroll>
    </HubPage>
  );
}
