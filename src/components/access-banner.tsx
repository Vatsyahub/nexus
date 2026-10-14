"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { defaultAccess, doorForPath, levelForPath } from "@/lib/access";
import { setWorkspaceWritesLocked } from "@/lib/store";
import { Button } from "@/components/ui/button";

export function AccessBanner() {
  const { data, update } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const role = data?.user?.clearance ?? "user";
  const access = data?.user?.access ?? defaultAccess(role);
  const level = levelForPath(pathname, access);
  const door = doorForPath(pathname);

  useEffect(() => {
    const quiet = door === "home" || door === "settings" || door === null;
    setWorkspaceWritesLocked(!quiet && level !== "edit");
  }, [level, door]);

  if (!data?.user?.impersonating) return null;

  return (
    <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--fh-line)] bg-[#fff6e5] px-3 py-2 text-sm text-[var(--fh-ink)]">
      <p>
        Viewing the hub as <strong>{data.user.name}</strong>. Changes follow
        their access, not Master.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          void update({ impersonateUserId: null } as never).then(() => {
            router.refresh();
          });
        }}
      >
        Return to {data.user.realName || "Master"}
      </Button>
    </div>
  );
}
