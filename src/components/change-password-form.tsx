"use client";

import { useActionState, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  changePassword,
  type ChangePasswordState,
} from "@/app/actions/password";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/password-field";

const initial: ChangePasswordState = {};

export function ChangePasswordForm({
  forced,
  allowRecovery,
}: {
  forced?: boolean;
  allowRecovery?: boolean;
}) {
  const { update } = useSession();
  const [state, action, pending] = useActionState(changePassword, initial);
  const [clientError, setClientError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!state.ok || finishing) return;
    setFinishing(true);
    // The flag is already false in the database. This read copies that
    // value into the cookie. Do not send mustChangePassword from the browser.
    void (async () => {
      try {
        await update();
      } catch {
        // Cookie may still refresh on next navigation
      }
      window.location.assign("/");
    })();
  }, [state.ok, finishing, update]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null);
    if (newPassword !== confirmPassword) {
      e.preventDefault();
      setClientError("New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      e.preventDefault();
      setClientError("New password must be at least 8 characters.");
    }
  }

  const message = clientError ?? state.error ?? null;

  return (
    <form
      action={action}
      onSubmit={onSubmit}
      className="mx-auto max-w-md space-y-4"
      noValidate
    >
      {forced && (
        <p className="rounded-md border border-[var(--fh-accent)]/40 bg-[var(--fh-accent)]/10 px-3 py-2 text-sm text-[var(--fh-ink)]">
          You must set a new password before using Nexus.
        </p>
      )}
      {allowRecovery && (
        <p className="text-sm text-[var(--fh-muted)]">
          Current password can be your password or the Master recovery
          passcode. Then choose a new password.
        </p>
      )}
      <PasswordField
        id="currentPassword"
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        required
        invalid={!!message}
      />
      <PasswordField
        id="newPassword"
        name="newPassword"
        label="New password"
        autoComplete="new-password"
        required
        minLength={8}
        value={newPassword}
        invalid={!!message}
        onChange={(v) => {
          setNewPassword(v);
          if (clientError) setClientError(null);
        }}
      />
      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmPassword}
        invalid={!!message}
        onChange={(v) => {
          setConfirmPassword(v);
          if (clientError) setClientError(null);
        }}
      />
      {message && (
        <div
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {message}
        </div>
      )}
      {(state.ok || finishing) && !message && (
        <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">
          Password updated. Opening Nexus…
        </p>
      )}
      <Button
        type="submit"
        disabled={pending || finishing}
        className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
      >
        {pending || finishing ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
