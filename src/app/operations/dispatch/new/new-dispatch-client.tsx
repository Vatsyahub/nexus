"use client";

import { useState } from "react";
import { HubReturnLink } from "@/components/hub-return-link";
import { HubPage } from "@/components/hub-scroll";
import { buttonVariants } from "@/components/ui/button";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { cn } from "@/lib/utils";
import { DispatchTab } from "@/app/reports/execution/dispatch-tab";

export function NewDispatchClient({ actorName }: { actorName: string }) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const [contractId, setContractId] = useState("");

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Add delivery challan
        </h1>
        <HubReturnLink
          href="/operations"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </HubReturnLink>
      </div>
      {!ready ? (
        <p className="text-sm text-[var(--fh-muted)]">Loading workspace from server…</p>
      ) : (
        <DispatchTab
          data={data}
          canEdit
          actorName={actorName}
          contractId={contractId}
          onContractChange={setContractId}
        />
      )}
    </HubPage>
  );
}
