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
import {
  DcRecordsTab,
  ItemListTab,
  SchedulesTab,
  SummaryTab,
} from "./report-tabs";

type Tab = "summary" | "schedules" | "supply" | "items";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "schedules", label: "Schedules" },
  { id: "supply", label: "DC records" },
  { id: "items", label: "Item list" },
];

function parseTab(raw: string | null): Tab {
  // Legacy ?tab=other&sub=supply → DC records
  if (raw === "other") return "supply";
  // Dispatch and installations now live under Operations.
  if (raw === "dispatch" || raw === "installations") return "summary";
  return TABS.some((t) => t.id === raw) ? (raw as Tab) : "summary";
}

export default function ExecutionReportClient({
  canRenameItem,
}: {
  canRenameItem: boolean;
}) {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { get, commit } = useViewQuery();
  const rawTab = get("tab");
  const sub = get("sub");
  const tab: Tab =
    rawTab === "other" && sub === "supply" ? "supply" : parseTab(rawTab);

  useEffect(() => {
    const raw = searchParams.get("tab");
    const legacySub = searchParams.get("sub");
    // Legacy Other reports lived under Execution — send WO/Tasks to new page
    if (raw === "other" && legacySub !== "supply") {
      const dest =
        legacySub === "tasks" ? "/reports/other?tab=tasks" : "/reports/other";
      router.replace(dest);
      return;
    }
    if (raw === "dispatch" || raw === "installations") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      params.delete("sub");
      const qs = params.toString();
      router.replace(qs ? `/reports/execution?${qs}` : "/reports/execution");
    }
  }, [searchParams, router]);

  function selectTab(next: Tab) {
    commit({
      tab: next === "summary" ? null : next,
      sub: null,
      q: null,
      from: null,
      to: null,
    });
  }

  return (
    <HubPage>
      <ReportsHeader title="Site Records" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : (
        <section className={reportPanelClass}>
          <div
            role="tablist"
            aria-label="Site Records"
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

          {tab === "summary" && <SummaryTab data={data} />}
          {tab === "schedules" && <SchedulesTab data={data} />}
          {tab === "supply" && <DcRecordsTab data={data} />}
          {tab === "items" && (
            <ItemListTab data={data} canRename={canRenameItem} />
          )}
        </section>
      )}
    </HubPage>
  );
}
