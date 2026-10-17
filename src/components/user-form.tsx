"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  createUser,
  updateUser,
  type UserActionState,
} from "@/app/actions/users";
import { listDepartments, useFlowhubData } from "@/lib/store";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserRow } from "@/components/user-management";

const initial: UserActionState = {};

export function UserForm({ existing }: { existing?: UserRow }) {
  const data = useFlowhubData();
  const departments = listDepartments(data);
  const action = existing ? updateUser : createUser;
  const [state, formAction, pending] = useActionState(action, initial);
  const [clearance, setClearance] = useState<UserRow["clearance"]>(
    existing?.clearance ?? "USER"
  );
  const needsDept = clearance === "USER" || clearance === "MANAGER";
  const optionalDept = clearance === "MASTER" || clearance === "DIRECTOR";

  return (
    <form
      action={formAction}
      {...entryRootProps}
      className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
    >
      {existing && <input type="hidden" name="userId" value={existing.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={existing?.name}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={existing?.email}
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="clearance">Clearance</Label>
          <select
            id="clearance"
            name="clearance"
            required
            value={clearance}
            onChange={(e) => setClearance(e.target.value as UserRow["clearance"])}
            className="flex h-9 w-full rounded-md border border-[var(--fh-line)] bg-white px-3 text-sm"
          >
            <option value="USER">User</option>
            <option value="MANAGER">Manager</option>
            <option value="DIRECTOR">Director</option>
            <option value="MASTER">Master</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">
            Department
            {needsDept ? "" : optionalDept ? " (optional — on paper)" : " (not used)"}
          </Label>
          <select
            id="department"
            name="department"
            required={needsDept}
            defaultValue={existing?.department ?? ""}
            className="flex h-9 w-full rounded-md border border-[var(--fh-line)] bg-white px-3 text-sm"
          >
            <option value="">
              {needsDept ? "Select department…" : "None"}
            </option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        {!existing && (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="tempPassword">Temporary password</Label>
            <Input
              id="tempPassword"
              name="tempPassword"
              type="text"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        )}
      </div>
      {optionalDept && (
        <p className="text-xs text-[var(--fh-muted)]">
          A Master assigned to a department still has Master privileges across
          every department.
        </p>
      )}
      {state.error && (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {state.error}
        </div>
      )}
      {state.ok && (
        <div
          className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800"
          role="status"
        >
          {existing ? "User updated." : `Created ${state.createdEmail}.`}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          {...entrySaveProps}
          disabled={pending}
          className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
        >
          {pending ? "Saving…" : existing ? "Save changes" : "Create user"}
        </Button>
        <Link href="/users" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>
    </form>
  );
}
