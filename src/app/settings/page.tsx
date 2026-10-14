import Link from "next/link";
import { auth } from "@/auth";
import { HubThemePicker } from "@/components/hub-theme";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Settings
        </h1>
        <p className="mt-2 text-sm text-[var(--fh-muted)]">
          Signed in as {session?.user?.email} ({session?.user?.clearance}).
        </p>
      </div>
      <div className="space-y-3 border-t border-[var(--fh-line)] pt-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--fh-steel)]">
          Hub colour
        </h2>
        <HubThemePicker />
      </div>
      <div className="space-y-3 border-t border-[var(--fh-line)] pt-6">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--fh-steel)]">
          Account
        </h2>
        <Link
          href="/settings/password"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Change password
        </Link>
      </div>
    </div>
  );
}
