"use client";

import { useState } from "react";
import { HubReturnLink } from "@/components/hub-return-link";
import { HubPage } from "@/components/hub-scroll";
import { buttonVariants } from "@/components/ui/button";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { cn } from "@/lib/utils";
import { InstallationsTab } from "@/app/reports/execution/installations-tab";

export function InstallationEditor({
  initialContractId,
  canEdit,
  actorName,
}: {
  initialContractId: string;
  canEdit: boolean;
  actorName: string;
}) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const [contractId, setContractId] = useState(initialContractId);

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Installations
        </h1>
        <HubReturnLink
          href="/operations?tab=installations"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </HubReturnLink>
      </div>
      {!canEdit && (
        <p className="shrink-0 text-sm text-[var(--fh-muted)]">
          View only — this login cannot save.
        </p>
      )}
      {!ready ? (
        <p className="text-sm text-[var(--fh-muted)]">Loading workspace from server…</p>
      ) : (
        <InstallationsTab
          data={data}
          canEdit={canEdit}
          actorName={actorName}
          contractId={contractId}
          onContractChange={setContractId}
        />
      )}
    </HubPage>
  );
}
