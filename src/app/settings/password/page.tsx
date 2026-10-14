import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  const forced = !!session?.user?.mustChangePassword;
  const allowRecovery =
    session?.user?.clearance === "master" && !session.user.impersonating;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Change password
        </h1>
        {forced ? (
          <p className="mt-2 text-sm text-[var(--fh-muted)]">
            {allowRecovery
              ? "Set a new password before using Nexus. The recovery passcode counts as the current password."
              : "First login — choose a password only you know."}
          </p>
        ) : null}
      </div>
      <ChangePasswordForm forced={forced} allowRecovery={allowRecovery} />
    </div>
  );
}
