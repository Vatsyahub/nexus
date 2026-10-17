"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { KeyRound, VenetianMask, X } from "lucide-react";
import { resetUserPassword, type UserActionState } from "@/app/actions/users";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DeleteIconButton,
  EditIconLink,
} from "@/components/icon-actions";
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

function ImpersonateIconButton({ userId }: { userId: string }) {
  const { update, data } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (data?.user?.impersonating) return null;
  if (data?.user?.id === userId) return null;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label="Impersonate"
      title="Open as user"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void update({ impersonateUserId: userId } as never).then(() => {
          router.push("/");
          router.refresh();
        });
      }}
    >
      <VenetianMask className="size-3.5" aria-hidden />
    </Button>
  );
}

function OtherUserActions({
  user,
  onDelete,
}: {
  user: UserRow;
  onDelete?: (user: UserRow) => void;
}) {
  const [state, action, pending] = useActionState(resetUserPassword, initial);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1">
        <EditIconLink href={`/users/${user.id}/edit`} label="Edit user" />
        {onDelete && (
          <DeleteIconButton
            onClick={() => onDelete(user)}
            label="Delete user"
          />
        )}
        <ImpersonateIconButton userId={user.id} />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={open ? "Cancel reset password" : "Reset password"}
          title={open ? "Cancel" : "Reset password"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <X className="size-3.5" aria-hidden />
          ) : (
            <KeyRound className="size-3.5" aria-hidden />
          )}
        </Button>
      </div>
      {open && (
        <form
          action={action}
          {...entryRootProps}
          className="flex flex-wrap items-end justify-end gap-2"
        >
          <input type="hidden" name="userId" value={user.id} />
          <div className="space-y-1 text-left">
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
            {...entrySaveProps}
            size="sm"
            disabled={pending}
            className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          >
            {pending ? "Saving…" : "Save temp password"}
          </Button>
        </form>
      )}
      {state.error && (
        <p className="max-w-xs text-right text-xs text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="max-w-xs text-right text-xs text-green-700" role="status">
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
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
          <tr>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Department</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="w-px whitespace-nowrap px-2 py-2 font-medium">
              Password
            </th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--fh-line)]">
          {users.map((u) => {
            const self = u.id === currentUserId;
            return (
              <tr key={u.id} className="align-middle">
                <td className="px-3 py-1.5 whitespace-nowrap text-[var(--fh-ink)]">
                  <span className="font-medium">{u.name}</span>
                  {self ? (
                    <span className="ml-1.5 text-xs text-[var(--fh-muted)]">
                      (you)
                    </span>
                  ) : null}
                  <span className="ml-2 text-xs font-normal text-[var(--fh-muted)]">
                    {u.email}
                  </span>
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-[var(--fh-muted)]">
                  {u.department || "—"}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {clearanceLabel[u.clearance]}
                </td>
                <td className="w-px whitespace-nowrap px-2 py-1.5">
                  <span
                    className={cn(
                      "inline-flex rounded px-1.5 py-0.5 text-[11px] leading-none font-medium",
                      u.mustChangePassword
                        ? "bg-amber-100 text-amber-800"
                        : "bg-[var(--fh-bg)] text-[var(--fh-muted)]"
                    )}
                  >
                    {u.mustChangePassword ? "Must change" : "Set"}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {self ? (
                    <div className="flex justify-end">
                      <Link
                        href="/settings"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" })
                        )}
                      >
                        Settings
                      </Link>
                    </div>
                  ) : (
                    <OtherUserActions user={u} onDelete={onDelete} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
