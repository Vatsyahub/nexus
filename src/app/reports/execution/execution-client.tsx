"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useViewQuery } from "@/lib/use-view-query";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { HubPage } from "@/components/hub-scroll";
import {
  ReportsEmpty,
  ReportsHeader,
  ReportsLoading,
  reportPanelClass,
} from "../reports-shell";
import { SegmentButton } from "./execution-ui";
import { DispatchTab } from "./dispatch-tab";
import { InstallationsTab } from "./installations-tab";
import {
  DcRecordsTab,
  ItemListTab,
  SchedulesTab,
  SummaryTab,
} from "./report-tabs";

type Tab =
  | "dispatch"
  | "installations"
  | "schedules"
  | "summary"
  | "supply"
  | "items";

const TABS: { id: Tab; label: string }[] = [
  { id: "dispatch", label: "Dispatch" },
  { id: "installations", label: "Installations" },
  { id: "schedules", label: "Schedules" },
  { id: "summary", label: "Summary" },
  { id: "supply", label: "DC records" },
  { id: "items", label: "Item list" },
];

function parseTab(raw: string | null): Tab {
  // Legacy ?tab=other&sub=supply → DC records
  if (raw === "other") {
    return "supply";
  }
  return TABS.some((t) => t.id === raw) ? (raw as Tab) : "dispatch";
}

export default function ExecutionReportClient({
  canEdit,
  canRenameItem,
  actorName,
}: {
  canEdit: boolean;
  canRenameItem: boolean;
  actorName: string;
}) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { get, commit } = useViewQuery();
  const rawTab = get("tab");
  const sub = get("sub");
  const tab: Tab =
    rawTab === "other" && sub === "supply"
      ? "supply"
      : rawTab === "other"
        ? "dispatch"
        : parseTab(rawTab);
  const contractId = get("contract");

  useEffect(() => {
    const raw = searchParams.get("tab");
    const legacySub = searchParams.get("sub");
    // Legacy Other reports lived under Execution — send WO/Tasks to new page
    if (raw === "other" && legacySub !== "supply") {
      const dest =
        legacySub === "tasks" ? "/reports/other?tab=tasks" : "/reports/other";
      router.replace(dest);
    }
  }, [searchParams, router]);

  function selectTab(next: Tab) {
    commit({
      tab: next === "dispatch" ? null : next,
      sub: null,
      q: null,
      from: null,
      to: null,
    });
  }

  function selectContract(id: string) {
    commit({ contract: id || null });
  }

  return (
    <HubPage>
      <ReportsHeader title="Operations" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : (
        <section className={reportPanelClass}>
          <div
            role="tablist"
            aria-label="Operations report"
            className="flex flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
          >
            {TABS.map((t) => (
              <SegmentButton
                key={t.id}
                active={tab === t.id}
                onClick={() => selectTab(t.id)}
                label={t.label}
              />
            ))}
          </div>

          {!canEdit && (tab === "dispatch" || tab === "installations") && (
            <p className="mt-3 text-sm text-[var(--fh-muted)]">
              View only — this login cannot change dispatch or installations.
            </p>
          )}

          {tab === "dispatch" && (
            <DispatchTab
              data={data}
              canEdit={canEdit}
              actorName={actorName}
              contractId={contractId}
              onContractChange={selectContract}
            />
          )}
          {tab === "installations" && (
            <InstallationsTab
              data={data}
              canEdit={canEdit}
              actorName={actorName}
              contractId={contractId}
              onContractChange={selectContract}
            />
          )}
          {tab === "schedules" && <SchedulesTab data={data} />}
          {tab === "summary" && <SummaryTab data={data} />}
          {tab === "supply" && (
            <DcRecordsTab data={data} canEdit={canEdit} />
          )}
          {tab === "items" && (
            <ItemListTab data={data} canRename={canRenameItem} />
          )}
        </section>
      )}
    </HubPage>
  );
}
