"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const raw = searchParams.get("tab");
    if (raw === "other" && searchParams.get("sub") === "supply") return "supply";
    if (raw === "other") return "dispatch";
    return parseTab(raw);
  });
  const [contractId, setContractId] = useState(
    () => searchParams.get("contract") ?? ""
  );

  useEffect(() => {
    const raw = searchParams.get("tab");
    const sub = searchParams.get("sub");
    // Legacy Other reports lived under Execution — send WO/Tasks to new page
    if (raw === "other" && sub !== "supply") {
      const dest =
        sub === "tasks" ? "/reports/other?tab=tasks" : "/reports/other";
      router.replace(dest);
      return;
    }
    if (raw === "other" && sub === "supply") setTab("supply");
    else setTab(parseTab(raw));
    setContractId(searchParams.get("contract") ?? "");
  }, [searchParams, router]);

  function replaceParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    // Drop legacy Other-reports sub param
    params.delete("sub");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function selectTab(next: Tab) {
    setTab(next);
    replaceParams({
      tab: next === "dispatch" ? null : next,
    });
  }

  function selectContract(id: string) {
    setContractId(id);
    replaceParams({ contract: id || null });
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
