"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useListFilters } from "@/lib/use-view-query";
import { HubReturnLink } from "@/components/hub-return-link";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import {
  buildCoreReportRows,
  formatCorePercent,
  formatWholeRupees,
  profitPercentOf,
  profitPercentTone,
  todayIso,
  wholeRupees,
  type CoreReportRow,
} from "@/lib/nexus-core";
import { matchesAny } from "@/lib/list-search";
import { ListSearchBar } from "@/components/list-search";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { buttonVariants } from "@/components/ui/button";
import { HubPage } from "@/components/hub-scroll";
import {
  ReportsTableScroll,
  reportMoney,
  reportTd,
  reportTh,
} from "@/app/reports/reports-shell";
import { cn } from "@/lib/utils";

const MONEY_KEYS = [
  "workOrder",
  "yetToBill",
  "yetToCollect",
  "spent",
  "yetToSpend",
  "profit",
] as const;

export default function CoreReportPage() {
  return (
    <Suspense fallback={null}>
      <CoreReportInner />
    </Suspense>
  );
}

function CoreReportInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { q, setQ } = useListFilters();
  const today = todayIso();

  const allRows = useMemo(
    () => buildCoreReportRows(data, today),
    [data, today]
  );
  const rows = useMemo(
    () =>
      allRows.filter((row) =>
        matchesAny(q, [
          row.projectName,
          row.projectNo,
          row.city === "—" ? "" : row.city,
          row.status,
        ])
      ),
    [allRows, q]
  );
  const totals = useMemo(() => {
    const selling = rows.reduce((sum, row) => sum + row.selling, 0);
    const profit = rows.reduce((sum, row) => sum + row.profit, 0);
    const money = Object.fromEntries(
      MONEY_KEYS.map((key) => [
        key,
        rows.reduce((sum, row) => sum + wholeRupees(row[key]), 0),
      ])
    ) as Record<(typeof MONEY_KEYS)[number], number>;
    return {
      ...money,
      profitPercent: profitPercentOf(profit, selling),
      exactProfit: profit,
    };
  }, [rows]);

  const exportRows = rows.map((row) => [
    projectExport(row),
    row.status,
    wholeRupees(row.workOrder),
    wholeRupees(row.yetToBill),
    wholeRupees(row.yetToCollect),
    wholeRupees(row.spent),
    wholeRupees(row.yetToSpend),
    wholeRupees(row.profit),
    row.profitPercent == null ? "" : Number(row.profitPercent.toFixed(2)),
  ]);
  if (rows.length) {
    exportRows.push([
      "Total",
      "",
      totals.workOrder,
      totals.yetToBill,
      totals.yetToCollect,
      totals.spent,
      totals.yetToSpend,
      totals.profit,
      totals.profitPercent == null
        ? ""
        : Number(totals.profitPercent.toFixed(2)),
    ]);
  }

  return (
    <HubPage className="max-w-none">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Nexus Core
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Core report
          </h1>
        </div>
        <HubReturnLink
          href="/nexus-core"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to Nexus Core
        </HubReturnLink>
      </div>

      <div className="flex shrink-0 flex-wrap items-start gap-3">
        <ListSearchBar
          value={q}
          onChange={setQ}
          placeholder="Search project name, number, city, status…"
        />
      </div>

      {!ready ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          Loading workspace from server…
        </p>
      ) : allRows.length === 0 ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          No contracts yet.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          No contracts match.
        </p>
      ) : (
        <>
          <ReportsTableScroll scrollX>
            <table className="list-sticky-head w-full min-w-[1080px] border-collapse text-left">
              <thead className="bg-[var(--fh-bg)]">
                <tr className="border-b border-[var(--fh-line)]">
                  <th className={reportTh}>Project</th>
                  <th className={reportTh}>Status</th>
                  <th className={cn(reportTh, "text-right")}>Work-order value</th>
                  <th className={cn(reportTh, "text-right")}>Yet to bill</th>
                  <th className={cn(reportTh, "text-right")}>Yet to collect</th>
                  <th className={cn(reportTh, "text-right")}>Spent</th>
                  <th className={cn(reportTh, "text-right")}>Yet to spend</th>
                  <th className={cn(reportTh, "text-right")}>Profit</th>
                  <th className={cn(reportTh, "text-right")}>Profit %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.contractId}
                    className="border-b border-[var(--fh-line)]"
                  >
                    <td className={reportTd}>
                      <ProjectCell row={row} />
                    </td>
                    <td className={reportTd}>{row.status}</td>
                    <Money value={row.workOrder} />
                    <Money value={row.yetToBill} />
                    <Money value={row.yetToCollect} />
                    <Money value={row.spent} />
                    <Money value={row.yetToSpend} />
                    <Money value={row.profit} />
                    <td className={cn(reportMoney, "text-right")}>
                      <Percent
                        profit={row.profit}
                        percent={row.profitPercent}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
                <tr>
                  <td className={reportTd}>Total</td>
                  <td className={reportTd} />
                  <Money value={totals.workOrder} />
                  <Money value={totals.yetToBill} />
                  <Money value={totals.yetToCollect} />
                  <Money value={totals.spent} />
                  <Money value={totals.yetToSpend} />
                  <Money value={totals.profit} />
                  <td className={cn(reportMoney, "text-right")}>
                    <Percent
                      profit={totals.exactProfit}
                      percent={totals.profitPercent}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </ReportsTableScroll>
          <ReportExportIcons
            filename="nexus-core-report"
            title="Nexus Core — Core report"
            singleLineHeaders
            filters={reportFilterSummary({
              search: q,
              extra: [["Amounts", "Whole rupees"]],
            })}
            headers={[
              "Project",
              "Status",
              "Work-order value",
              "Yet to bill",
              "Yet to collect",
              "Spent",
              "Yet to spend",
              "Profit",
              "Profit %",
            ]}
            rows={exportRows}
          />
        </>
      )}
    </HubPage>
  );
}

function projectExport(row: CoreReportRow): string {
  return `${row.projectName}\n${row.projectNo}  ${row.city}`;
}

function ProjectCell({ row }: { row: CoreReportRow }) {
  return (
    <div className="min-w-[12rem]">
      <Link
        href={`/contracts/${row.contractId}`}
        className="break-words font-medium text-[var(--fh-steel)] hover:underline"
      >
        {row.projectName}
      </Link>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-xs text-[var(--fh-muted)]">
        <span className="break-all">{row.projectNo}</span>
        <span className="break-words">{row.city}</span>
      </p>
    </div>
  );
}

function Money({ value }: { value: number }) {
  return (
    <td className={cn(reportMoney, "text-right text-[var(--fh-ink)]")}>
      {formatWholeRupees(value)}
    </td>
  );
}

function Percent({
  profit,
  percent,
}: {
  profit: number;
  percent: number | null;
}) {
  const tone = profitPercentTone(profit, percent);
  return (
    <span
      data-profit-tone={tone ?? undefined}
      className={cn(
        "inline-block rounded-md px-1.5 py-0.5 font-medium",
        tone === "green" &&
          "bg-[var(--fh-profit-green-tint)] text-[var(--fh-profit-green)]",
        tone === "yellow" &&
          "bg-[var(--fh-profit-yellow-tint)] text-[var(--fh-profit-yellow)]",
        tone === "red" &&
          "bg-[var(--fh-profit-red-tint)] text-[var(--fh-profit-red)]"
      )}
    >
      {formatCorePercent(percent)}
    </span>
  );
}
