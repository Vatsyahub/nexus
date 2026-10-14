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
import {
  OtherReportsPanels,
  type OtherSub,
} from "../execution/report-tabs";

function parseSub(raw: string | null): OtherSub {
  if (raw === "tasks" || raw === "amendments") return raw;
  return "workorders";
}

export default function OtherReportsClient() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<OtherSub>(() =>
    parseSub(searchParams.get("tab"))
  );

  useEffect(() => {
    setSub(parseSub(searchParams.get("tab")));
  }, [searchParams]);

  function selectSub(next: OtherSub) {
    setSub(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "workorders") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
