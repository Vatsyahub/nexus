"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useWorkspaceReady } from "@/lib/store";
import { defaultAccess, reportDoorForHref } from "@/lib/access";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { LIVE_REPORTS, REPORT_HOME_HREFS, ReportsLoading } from "./reports-shell";

export default function ReportsHomePage() {
  const ready = useWorkspaceReady();
  const { data } = useSession();
  const access =
    data?.user?.access ?? defaultAccess(data?.user?.clearance ?? "user");
  const cards = REPORT_HOME_HREFS.flatMap((href) => {
    const report = LIVE_REPORTS.find((item) => item.href === href);
    if (!report) return [];
    const door = reportDoorForHref(report.href);
    if (door && access[door] === "block") return [];
    return [report];
  });

  const labels = cards.map((card) => card.label);

  return (
    <HubPage className="max-w-5xl">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Reports
        </h1>
      </div>

      {!ready ? (
        <ReportsLoading />
      ) : (
        <HubDataScroll>
          <div className="w-full">
            {/* One box plus the usual gap, so row 1 starts where Sales sat. */}
            <div
              aria-hidden
              className="invisible mb-2 w-max rounded-lg border border-transparent px-4 py-3"
            >
              <p className="font-[family-name:var(--font-display)] text-base">
                &nbsp;
              </p>
            </div>
            <section className="grid w-full grid-cols-[repeat(3,max-content)] justify-between gap-y-4">
              {cards.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="inline-grid whitespace-nowrap rounded-lg border border-[var(--fh-line)] bg-white px-4 py-3 transition hover:border-[var(--fh-steel)]/40"
                >
                  {labels.map((label) => (
                    <span
                      key={label}
                      aria-hidden={label !== r.label}
                      className={
                        label === r.label
                          ? "col-start-1 row-start-1 font-[family-name:var(--font-display)] text-base text-[var(--fh-steel)]"
                          : "invisible col-start-1 row-start-1 font-[family-name:var(--font-display)] text-base"
                      }
                    >
                      {label}
                    </span>
                  ))}
                </Link>
              ))}
            </section>
          </div>
        </HubDataScroll>
      )}
    </HubPage>
  );
}
