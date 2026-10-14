"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  hydrateWorkspace,
  isWorkspaceHydratedFromServer,
} from "@/lib/store";
import { ConfirmPanel } from "@/components/confirm-panel";
import { HubThemeSync } from "@/components/hub-theme";
import { SaveNotice } from "@/components/save-notice";

function WorkspaceHydrator({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;

    let cancelled = false;

    // Force retry after login — a prior anonymous 401 / race must not stick.
    // Brief backoff if the first GET races the session cookie.
    void (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        await hydrateWorkspace({ force: true });
        if (cancelled || isWorkspaceHydratedFromServer()) return;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  return <>{children}</>;
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <HubThemeSync />
      <WorkspaceHydrator>{children}</WorkspaceHydrator>
      <ConfirmPanel />
      <SaveNotice />
    </SessionProvider>
  );
}
