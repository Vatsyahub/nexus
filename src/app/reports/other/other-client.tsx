"use client";

import { useViewQuery } from "@/lib/use-view-query";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { HubPage } from "@/components/hub-scroll";
import {
  ReportsEmpty,
  ReportsHeader,
  ReportsLoading,
  reportPanelClass,
} from "../reports-shell";
import {
  OtherReportsPanels,
  type OtherSub,
} from "../execution/report-tabs";

function parseSub(raw: string): OtherSub {
  if (raw === "tasks" || raw === "amendments" || raw === "advances") return raw;
  return "workorders";
}

export default function OtherReportsClient() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { get, commit } = useViewQuery();
  const sub = parseSub(get("tab"));

  function selectSub(next: OtherSub) {
    commit({
      tab: next === "workorders" ? null : next,
      q: null,
      from: null,
      to: null,
      contract: null,
    });
  }

  return (
    <HubPage>
      <ReportsHeader title="Other reports" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : (
        <section className={reportPanelClass}>
          <OtherReportsPanels data={data} sub={sub} onSubChange={selectSub} />
        </section>
      )}
    </HubPage>
  );
}
