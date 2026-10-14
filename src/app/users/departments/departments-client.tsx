"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addCustomDepartment,
  flushWorkspace,
  listDepartments,
  useFlowhubData,
} from "@/lib/store";
import type { UserRow } from "@/components/user-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { departmentDisplayName } from "@/lib/types";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export function DepartmentsClient({ users }: { users: UserRow[] }) {
  const data = useFlowhubData();
  const departments = useMemo(() => listDepartments(data), [data]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function addDept(e: React.FormEvent) {
    e.preventDefault();
    const created = addCustomDepartment(name);
    if (!created) {
      setMsg("Enter a department name.");
      return;
    }
    await flushWorkspace();
    setName("");
    setMsg(`Added “${created}”.`);
  }

  return (
    <HubPage className="max-w-5xl">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Departments
          </h1>
        </div>
        <Link href="/users" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to users
        </Link>
      </div>

      <form
        onSubmit={addDept}
        className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--fh-line)] bg-white p-4"
      >
        <div className="space-y-1">
          <Label htmlFor="newDept">Add department</Label>
          <Input
            id="newDept"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quality Department"
            className="w-64"
          />
        </div>
        <Button type="submit" className="bg-[var(--fh-steel)]">
          Add department
        </Button>
        {msg && <p className="text-sm text-[var(--fh-steel)]">{msg}</p>}
      </form>

      <HubDataScroll className="space-y-4">
        {departments.map((dept) => {
          const members = users.filter((u) => u.department === dept);
          const managers = members.filter(
            (u) => u.clearance === "MANAGER" || u.clearance === "MASTER"
          );
          const staff = members.filter((u) => u.clearance === "USER");
          return (
            <section
              key={dept}
              className="rounded-xl border border-[var(--fh-line)] bg-white p-5"
            >
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
                {departmentDisplayName(dept)}
              </h2>
              <p className="mt-1 text-xs text-[var(--fh-muted)]">
                {members.length} people
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                    Managers
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {managers.length === 0 ? (
                      <li className="text-[var(--fh-muted)]">None assigned</li>
                    ) : (
                      managers.map((u) => (
                        <li key={u.id}>
                          {u.name}{" "}
                          <span className="text-[var(--fh-muted)]">
                            ({u.clearance === "MASTER" ? "Master" : "Manager"})
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                    Users
                  </p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {staff.length === 0 ? (
                      <li className="text-[var(--fh-muted)]">None</li>
                    ) : (
                      staff.map((u) => <li key={u.id}>{u.name}</li>)
                    )}
                  </ul>
                </div>
              </div>
            </section>
          );
        })}
      </HubDataScroll>
    </HubPage>
  );
}
