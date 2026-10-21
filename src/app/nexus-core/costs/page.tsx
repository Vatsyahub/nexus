"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import {
  buildCostCentreRows,
  formatCoreMoney,
  formatCorePercent,
  profitPercentOf,
  profitPercentTone,
  todayIso,
  type CostCentreRow,
  type ProfitPercentTone,
} from "@/lib/nexus-core";
import { matchesAny } from "@/lib/list-search";
import { ProjectIdentity } from "@/components/project-identity";
import { ListSearchBar } from "@/components/list-search";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { buttonVariants } from "@/components/ui/button";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

export default function CostCentrePage() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const [q, setQ] = useState("");
  const [lossesOnly, setLossesOnly] = useState(false);
  const today = todayIso();

  const allRows = useMemo(
    () => buildCostCentreRows(data, today),
    [data, today]
  );
  const rows = useMemo(
    () =>
      allRows.filter((row) => {
        if (lossesOnly && !(row.profit < 0)) return false;
        return matchesAny(q, [
          row.projectName,
          row.projectNo,
          row.city === "—" ? "" : row.city,
          row.status,
        ]);
      }),
    [allRows, q, lossesOnly]
  );
  const totals = useMemo(() => {
    const selling = rows.reduce((s, r) => s + r.comparison, 0);
    const profit = rows.reduce((s, r) => s + r.profit, 0);
    return {
      workOrder: rows.reduce((s, r) => s + r.workOrder, 0),
      spent: rows.reduce((s, r) => s + r.spent, 0),
      yetToSpend: rows.reduce((s, r) => s + r.yetToSpend, 0),
      expenses: rows.reduce((s, r) => s + r.expenses, 0),
      cumulative: rows.reduce((s, r) => s + r.cumulative, 0),
      selling,
      profit,
      profitPercent: profitPercentOf(profit, selling),
    };
  }, [rows]);

  const exportRows = rows.map((r) => [
    r.projectName,
    r.projectNo,
    r.city,
    r.status,
    r.workOrder,
    r.spent,
    r.yetToSpend,
    r.expenses,
    r.cumulative,
    r.profit,
    r.profitPercent == null ? "" : Number(r.profitPercent.toFixed(2)),
  ]);
  if (rows.length) {
    exportRows.push([
      "Total",
      "",
      "",
      "",
      totals.workOrder,
      totals.spent,
      totals.yetToSpend,
      totals.expenses,
      totals.cumulative,
      totals.profit,
      totals.profitPercent == null
        ? ""
        : Number(totals.profitPercent.toFixed(2)),
    ]);
  }

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Nexus Core
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Cost centre
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/nexus-core/costs/add"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            Add costs
          </Link>
          <Link
            href="/nexus-core"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to Nexus Core
          </Link>
        </div>
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
      ) : (
        <>
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--fh-line)] bg-white px-4 py-3">
            <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <TopFigure
                label="Total selling price"
                value={formatCoreMoney(totals.selling)}
              />
              <TopFigure
                label="Total cost"
                value={formatCoreMoney(totals.cumulative)}
              />
              <TopFigure
                label="Total profit"
                value={formatCoreMoney(totals.profit)}
                loss={totals.profit < -0.005}
              />
              <TopFigure
                label="Profit %"
                value={formatCorePercent(totals.profitPercent)}
                tone={profitPercentTone(totals.profit, totals.profitPercent)}
              />
            </dl>
            <div className="flex items-center gap-2">
              <p className="text-sm tabular-nums text-[var(--fh-muted)]">
                {rows.length} {rows.length === 1 ? "project" : "projects"}
              </p>
              <button
                type="button"
                aria-pressed={lossesOnly}
                aria-label="Losses"
                data-losses={lossesOnly ? "on" : "off"}
                onClick={() => setLossesOnly((on) => !on)}
                className="inline-flex size-8 items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--destructive)]/40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-6 overflow-visible"
                  aria-hidden
                >
                  <text
                    x="12"
                    y="18"
                    textAnchor="middle"
                    fontSize="20"
                    fontWeight="700"
                    fill={lossesOnly ? "var(--destructive)" : "none"}
                    stroke="var(--destructive)"
                    strokeWidth={lossesOnly ? 0.6 : 1.4}
                  >
                    ₹
                  </text>
                </svg>
              </button>
            </div>
          </div>
          <HubDataScroll className="space-y-4">
            {rows.length === 0 ? (
              <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-10 text-center text-sm text-[var(--fh-muted)]">
                No contracts match.
              </p>
            ) : (
              <ul className="space-y-4" aria-label="Cost centre report">
                {rows.map((row) => (
                  <ProjectCostCard key={row.contractId} row={row} />
                ))}
              </ul>
            )}
            {rows.length > 0 ? (
              <TotalCard totals={totals} />
            ) : null}
          </HubDataScroll>
          <ReportExportIcons
            filename="nexus-core-cost-centre"
            title="Nexus Core — Cost centre"
            filters={reportFilterSummary({
              search: q,
              extra: [
                ...(lossesOnly
                  ? [["Showing", "Losses"] as [string, string]]
                  : []),
                ["Amounts", "Rupees"],
              ],
            })}
            headers={[
              "Project",
              "Project no.",
              "City",
              "Status",
              "Work-order value",
              "Cost covered",
              "Cost to be covered",
              "Expenses",
              "Cumulative cost",
              "Profit or loss",
              "Profit or loss %",
            ]}
            rows={exportRows}
          />
        </>
      )}
    </HubPage>
  );
}

function ProjectCostCard({ row }: { row: CostCentreRow }) {
  const loss = row.profit < -0.005;
  return (
    <li className="overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white">
      <div className="flex min-w-0">
        <div className="w-1.5 shrink-0 bg-[var(--fh-accent)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 bg-[var(--fh-bg)] px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-4">
            <ProjectIdentity
              projectName={row.projectName}
              projectNo={row.projectNo}
              href={`/contracts/${row.contractId}`}
            />
            <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
              <p className="text-sm text-[var(--fh-steel)]">
                <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                  City
                </span>
                {row.city}
              </p>
              <p className="text-sm text-[var(--fh-steel)]">
                <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                  Status
                </span>
                {row.status}
              </p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-[var(--fh-line)] sm:grid-cols-4 lg:grid-cols-7">
            <Metric label="Work-order value" value={formatCoreMoney(row.workOrder)} />
            <Metric label="Cost covered" value={formatCoreMoney(row.spent)} />
            <Metric label="Cost to be covered" value={formatCoreMoney(row.yetToSpend)} />
            <Metric label="Expenses" value={formatCoreMoney(row.expenses)} />
            <Metric label="Cumulative cost" value={formatCoreMoney(row.cumulative)} />
            <Metric
              label="Profit or loss"
              value={formatCoreMoney(row.profit)}
              loss={loss}
            />
            <Metric
              label="Profit or loss %"
              value={formatCorePercent(row.profitPercent)}
              tone={profitPercentTone(row.profit, row.profitPercent)}
            />
          </dl>
        </div>
      </div>
    </li>
  );
}

function TotalCard({
  totals,
}: {
  totals: {
    workOrder: number;
    spent: number;
    yetToSpend: number;
    expenses: number;
    cumulative: number;
    profit: number;
    profitPercent: number | null;
  };
}) {
  const loss = totals.profit < -0.005;
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--fh-steel)] bg-[var(--fh-steel)] text-white">
      <div className="px-4 py-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Total
        </h2>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/20 sm:grid-cols-4 lg:grid-cols-7">
        <Metric
          label="Work-order value"
          value={formatCoreMoney(totals.workOrder)}
          onSteel
        />
        <Metric
          label="Cost covered"
          value={formatCoreMoney(totals.spent)}
          onSteel
        />
        <Metric
          label="Cost to be covered"
          value={formatCoreMoney(totals.yetToSpend)}
          onSteel
        />
        <Metric
          label="Expenses"
          value={formatCoreMoney(totals.expenses)}
          onSteel
        />
        <Metric
          label="Cumulative cost"
          value={formatCoreMoney(totals.cumulative)}
          onSteel
        />
        <Metric
          label="Profit or loss"
          value={formatCoreMoney(totals.profit)}
          loss={loss}
          onSteel
        />
        <Metric
          label="Profit or loss %"
          value={formatCorePercent(totals.profitPercent)}
          tone={profitPercentTone(totals.profit, totals.profitPercent)}
          onSteel
        />
      </dl>
    </section>
  );
}

function TopFigure({
  label,
  value,
  loss,
  tone,
}: {
  label: string;
  value: string;
  loss?: boolean;
  tone?: ProfitPercentTone | null;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--fh-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold tabular-nums leading-none sm:text-3xl",
          loss ? "text-[var(--destructive)]" : "text-[var(--fh-steel)]"
        )}
      >
        {tone ? (
          <span
            data-profit-tone={tone}
            className={cn(
              "inline-block rounded-md px-1.5 py-0.5 text-xl sm:text-2xl",
              tone === "green" &&
                "bg-[var(--fh-profit-green-tint)] text-[var(--fh-profit-green)]",
              tone === "yellow" &&
                "bg-[var(--fh-profit-yellow-tint)] text-[var(--fh-profit-yellow)]",
              tone === "red" &&
                "bg-[var(--fh-profit-red-tint)] text-[var(--fh-profit-red)]"
            )}
          >
            {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Metric({
  label,
  value,
  loss,
  onSteel,
  tone,
}: {
  label: string;
  value: string;
  loss?: boolean;
  onSteel?: boolean;
  tone?: ProfitPercentTone | null;
}) {
  return (
    <div className={cn("px-3 py-3 sm:px-4", onSteel ? "bg-[var(--fh-steel)]" : "bg-white")}>
      <dt
        className={cn(
          "text-[10px] font-medium uppercase leading-tight tracking-wide",
          onSteel ? "text-white/70" : "text-[var(--fh-muted)]"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 break-all font-[family-name:var(--font-display)] text-lg tabular-nums leading-tight sm:text-xl",
          onSteel ? "text-white" : "text-[var(--fh-steel)]",
          loss && (onSteel ? "text-red-200" : "text-[var(--destructive)]")
        )}
      >
        {tone ? (
          <span
            data-profit-tone={tone}
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
            {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
