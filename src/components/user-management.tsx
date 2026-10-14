"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetUserPassword, type UserActionState } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DeleteIconButton,
  EditIconLink,
} from "@/components/icon-actions";
import { ImpersonateButton } from "@/components/impersonate-button";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  clearance: "USER" | "MANAGER" | "DIRECTOR" | "MASTER";
  department: string | null;
  mustChangePassword: boolean;
  createdAt: string;
};

const initial: UserActionState = {};

const clearanceLabel: Record<UserRow["clearance"], string> = {
  USER: "User",
  MANAGER: "Manager",
  DIRECTOR: "Director",
  MASTER: "Master",
};

function ResetPasswordRow({ user }: { user: UserRow }) {
  const [state, action, pending] = useActionState(resetUserPassword, initial);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Cancel" : "Reset password"}
      </Button>
      {open && (
        <form action={action} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="userId" value={user.id} />
          <div className="space-y-1">
            <Label htmlFor={`reset-${user.id}`} className="text-xs">
              New temporary password
            </Label>
            <Input
              id={`reset-${user.id}`}
              name="tempPassword"
              type="text"
              required
              minLength={8}
              className="h-8 w-48"
            />
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          >
            {pending ? "Saving…" : "Save temp password"}
          </Button>
        </form>
      )}
      {state.error && (
        <p className="text-xs text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="text-xs text-green-700" role="status">
          Temporary password set. They must change it on next login.
        </p>
      )}
    </div>
  );
}

export function UsersTable({
  users,
  currentUserId,
  onDelete,
}: {
  users: UserRow[];
  currentUserId: string;
  onDelete?: (user: UserRow) => void;
}) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-[var(--fh-muted)]">No users match.</p>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--fh-line)] bg-white">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Clearance</th>
            <th className="px-4 py-3 font-medium">Department</th>
            <th className="px-4 py-3 font-medium">Password</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--fh-line)]">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-medium text-[var(--fh-ink)]">
                {u.name}
                {u.id === currentUserId ? (
                  <span className="ml-2 text-xs text-[var(--fh-muted)]">(you)</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-[var(--fh-muted)]">{u.email}</td>
              <td className="px-4 py-3">{clearanceLabel[u.clearance]}</td>
              <td className="px-4 py-3 text-[var(--fh-muted)]">
                {u.department || "—"}
              </td>
              <td className="px-4 py-3 text-[var(--fh-muted)]">
                {u.mustChangePassword ? "Must change" : "Set"}
              </td>
              <td className="px-4 py-3">
                {u.id === currentUserId ? (
                  <Link
                    href="/settings"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Settings
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <EditIconLink
                      href={`/users/${u.id}/edit`}
                      label="Edit user"
                    />
                    {onDelete && (
                      <DeleteIconButton
                        onClick={() => onDelete(u)}
                        label="Delete user"
                      />
                    )}
                    <ImpersonateButton userId={u.id} />
                    <ResetPasswordRow user={u} />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
