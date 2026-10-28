"use client";

import { useMemo, useState } from "react";
import { HubReturnLink } from "@/components/hub-return-link";
import { useRouter } from "next/navigation";
import { reassignDepartmentMembers } from "@/app/actions/users";
import { confirmAction } from "@/components/confirm-panel";
import { deleteDepartmentRecords } from "@/lib/departments";
import {
  addCustomDepartment,
  deleteDepartment,
  flushWorkspace,
  getData,
  listDepartments,
  renameDepartment,
  useFlowhubData,
} from "@/lib/store";
import type { UserRow } from "@/components/user-management";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sameDepartment } from "@/lib/task-notices";
import { departmentDisplayName } from "@/lib/types";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export function DepartmentsClient({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const data = useFlowhubData();
  const departments = useMemo(() => listDepartments(data), [data]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

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

  function startRename(dept: string) {
    setEditing(dept);
    setDraft(dept);
    setMsg(null);
  }

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    const from = editing;
    const renamed = renameDepartment(from, draft);
    if (!renamed.ok) {
      setMsg(renamed.error);
      return;
    }
    if (renamed.to === renamed.from) {
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      let people: { error?: string };
      try {
        people = await reassignDepartmentMembers(renamed.from, renamed.to);
      } catch {
        renameDepartment(renamed.to, renamed.from);
        await flushWorkspace().catch(() => undefined);
        setMsg("Could not rename that department.");
        return;
      }
      if (people.error) {
        renameDepartment(renamed.to, renamed.from);
        await flushWorkspace().catch(() => undefined);
        setMsg(people.error);
        return;
      }
      try {
        await flushWorkspace();
      } catch {
        setMsg("Could not save the workspace.");
        return;
      }
      setEditing(null);
      setDraft("");
      setMsg(`Renamed “${renamed.from}” to “${renamed.to}”.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(dept: string) {
    if (busy) return;
    const plan = deleteDepartmentRecords(getData(), [], dept);
    if (!plan.ok) {
      setMsg(plan.error);
      return;
    }
    if (
      !(await confirmAction({
        message: `Delete “${plan.from}”? People and tasks in this department will have no department.`,
        action: "Delete",
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      let people: { error?: string };
      try {
        people = await reassignDepartmentMembers(plan.from, null);
      } catch {
        setMsg("Could not delete that department.");
        return;
      }
      if (people.error) {
        setMsg(people.error);
        return;
      }
      const deleted = deleteDepartment(plan.from);
      if (!deleted.ok) {
        setMsg(deleted.error);
        return;
      }
      try {
        await flushWorkspace();
      } catch {
        setMsg("Could not save the workspace.");
        return;
      }
      if (editing === dept) setEditing(null);
      setMsg(`Deleted “${deleted.from}”.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <HubPage className="max-w-5xl">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Departments
          </h1>
        </div>
        <HubReturnLink href="/users" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to users
        </HubReturnLink>
      </div>

      <form
        onSubmit={addDept}
        {...entryRootProps}
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
        <Button type="submit" {...entrySaveProps} className="bg-[var(--fh-steel)]">
          Add department
        </Button>
        {msg && <p className="text-sm text-[var(--fh-steel)]">{msg}</p>}
      </form>

      <HubDataScroll className="space-y-4">
        {departments.map((dept) => {
          const primary = users.filter((u) => u.department === dept);
          const alsoManaging = users.filter(
            (u) =>
              u.clearance === "MANAGER" &&
              sameDepartment(u.secondDepartment, dept) &&
              !primary.some((row) => row.id === u.id)
          );
          const members = [...primary, ...alsoManaging];
          const managers = members.filter(
            (u) => u.clearance === "MANAGER" || u.clearance === "MASTER"
          );
          const staff = members.filter((u) => u.clearance === "USER");
          const renaming = editing === dept;
          return (
            <section
              key={dept}
              className="rounded-xl border border-[var(--fh-line)] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
                    {departmentDisplayName(dept)}
                  </h2>
                  <p className="mt-1 text-xs text-[var(--fh-muted)]">
                    {members.length} people
                  </p>
                </div>
                {renaming ? (
                  <form
                    onSubmit={saveRename}
                    {...entryRootProps}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Label htmlFor="renameDept" className="sr-only">
                      New name for {dept}
                    </Label>
                    <Input
                      id="renameDept"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="w-56"
                      disabled={busy}
                    />
                    <Button
                      type="submit"
                      {...entrySaveProps}
                      className="bg-[var(--fh-steel)]"
                      disabled={busy}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => startRename(dept)}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => remove(dept)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
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
