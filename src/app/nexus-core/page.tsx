"use client";

import { Suspense, useMemo } from "react";
import { useViewQuery } from "@/lib/use-view-query";
import Link from "next/link";
import {
  contractActualRetentionHold,
  outstandingIsStillDue,
  taskIsOpen,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { departmentDisplayName } from "@/lib/types";
import { buildInvoiceOutstandingRows } from "@/lib/reports";
import {
  bankGuaranteeTotal,
  billingCityBars,
  billingScaleMax,
  buildOutstandingOverview,
  comparisonValue,
  contractCities,
  contractCostAmount,
  contractDisplayStatus,
  contractExpenseTotal,
  costSellingPie,
  financialYear,
  formatCoreDay,
  formatCoreMoney,
  formatCorePercent,
  fyCollection,
  fyNetInvoiceValue,
  normalizeNexusCosts,
  piePercents,
  todayIso,
  type BillingBar,
  type CostSellingPie,
} from "@/lib/nexus-core";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const selectClass =
  "h-[26px] max-w-[9.5rem] truncate rounded border border-[var(--fh-line)] bg-[var(--fh-panel)] px-1.5 text-[13px] text-[var(--fh-ink)]";

const INK = "var(--fh-ink)";
const STEEL = "var(--fh-steel)";
const GOLD = "var(--fh-accent)";
const MUTED = "var(--fh-muted)";
const LOSS = "var(--destructive)";
const PIE_PROFIT = "var(--fh-pie-profit)";
const PIE_COST = "var(--fh-pie-cost)";
const TRACK = "var(--fh-line)";
const PANEL = "var(--fh-panel)";

export default function NexusCorePage() {
  return (
    <Suspense fallback={null}>
      <NexusCoreInner />
    </Suspense>
  );
}

function NexusCoreInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { get, commit } = useViewQuery();
  const billCity = get("city");
  const withRetention = get("retention") !== "0";

  function setBillCity(value: string) {
    commit({ city: value || null });
  }

  function setWithRetention(next: boolean) {
    commit({ retention: next ? null : "0" });
  }

  const today = todayIso();
  const fy = financialYear(today);
  const costs = useMemo(() => normalizeNexusCosts(data.nexusCosts), [data]);
  const contracts = useMemo(
    () =>
      data.contracts
        .slice()
        .sort((a, b) => a.projectNo.localeCompare(b.projectNo)),
    [data.contracts]
  );
  const cities = useMemo(
    () =>
      contractCities(
        contracts.filter(
          (c) => contractDisplayStatus(data, c, today) === "Active"
        )
      ),
    [contracts, data, today]
  );
  const billCityOnChart = cities.includes(billCity) ? billCity : "";

  const netInvoice = fyNetInvoiceValue(data, fy);
  const guarantees = bankGuaranteeTotal(data);
  const collection = fyCollection(data, fy);
  const collectedThrough =
    today < fy.start ? fy.start : today > fy.end ? fy.end : today;

  const pie = useMemo(() => {
    let selling = 0;
    let contractCost = 0;
    let expenses = 0;
    let retentionHeld = 0;
    for (const c of contracts) {
      selling += comparisonValue(data, c, today);
      contractCost += contractCostAmount(c, costs);
      expenses += contractExpenseTotal(c);
      retentionHeld += contractActualRetentionHold(c.id, data);
    }
    return costSellingPie(
      { selling, contractCost, expenses, retentionHeld },
      withRetention
    );
  }, [contracts, data, today, costs, withRetention]);

  const bars = useMemo(
    () => billingCityBars(contracts, data, billCityOnChart, today),
    [contracts, data, billCityOnChart, today]
  );

  const outstanding = useMemo(() => {
    const rows = buildInvoiceOutstandingRows(data).filter((row) =>
      outstandingIsStillDue(row.outstanding)
    );
    return buildOutstandingOverview(rows);
  }, [data]);

  const departments = useMemo(() => {
    const todayKey = today;
    const map = new Map<string, { open: number; overdue: number }>();
    for (const task of data.tasks) {
      if (!taskIsOpen(task)) continue;
      const name = departmentDisplayName(task.department) || "Unassigned";
      const row = map.get(name) ?? { open: 0, overdue: 0 };
      row.open += 1;
      if (task.dueDate && task.dueDate < todayKey) row.overdue += 1;
      map.set(name, row);
    }
    return [...map.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  }, [data.tasks, today]);

  return (
    <div
      data-nexus-core-home
      className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden"
    >
      <header className="flex w-full shrink-0 items-center justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Nexus Core
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/nexus-core/costs"
            className={cn(
              buttonVariants(),
              "h-auto bg-[var(--fh-steel)] px-4 py-2 text-sm text-white hover:bg-[var(--fh-steel)]/90"
            )}
          >
            Cost centre
          </Link>
          <Link
            href="/nexus-core/report"
            className={cn(
              buttonVariants(),
              "h-auto bg-[var(--fh-steel)] px-4 py-2 text-sm text-white hover:bg-[var(--fh-steel)]/90"
            )}
          >
            Core report
          </Link>
        </div>
      </header>

      <section
        data-core-figures
        className="flex w-max max-w-full shrink-0 flex-nowrap items-stretch gap-4"
      >
        <Stat
          label="Net invoice value"
          hint={`${fy.label} · ${formatCoreDay(fy.start)} – ${formatCoreDay(fy.end)}`}
          value={ready ? formatCoreMoney(netInvoice) : "…"}
          emphasize
        />
        <Stat
          label="Bank guarantee value"
          hint="ABG + PBG not retrieved"
          value={ready ? formatCoreMoney(guarantees) : "…"}
        />
        <Stat
          label="Collections"
          hint={`${fy.label} · received ${formatCoreDay(fy.start)} – ${formatCoreDay(collectedThrough)}`}
          value={ready ? formatCoreMoney(collection) : "…"}
        />
      </section>

      <div className="flex min-h-0 w-full flex-1 overflow-hidden">
        <section
          data-core-grid
          className="grid h-full min-h-0 w-full gap-4"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
          }}
        >
        <ChartCard
          title="Profits Overview"
          controls={
            <div className="flex min-w-0 max-w-full flex-wrap rounded border border-[var(--fh-line)] p-0.5">
              <Toggle
                active={withRetention}
                onClick={() => setWithRetention(true)}
              >
                With retention
              </Toggle>
              <Toggle
                active={!withRetention}
                onClick={() => setWithRetention(false)}
              >
                Without retention
              </Toggle>
            </div>
          }
        >
          <CostPie pie={pie} withRetention={withRetention} />
        </ChartCard>

        <ChartCard
          title="Billing Progression"
          controls={
            <label className="flex items-center gap-1.5 text-[13px] text-[var(--fh-muted)]">
              City
              <select
                id="bill-city"
                aria-label="City"
                data-billing-filter="cities"
                className={selectClass}
                value={billCityOnChart}
                onChange={(e) => setBillCity(e.target.value)}
              >
                <option value="">All cities</option>
                {cities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          }
        >
          <BillingChart bars={bars} />
        </ChartCard>

        <ChartCard title="Receivables Overview">
          <OutstandingChart overview={outstanding} />
        </ChartCard>

        <ChartCard title="Task Progression">
          <DepartmentChart rows={departments} />
        </ChartCard>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  hint,
  value,
  emphasize,
}: {
  label: string;
  hint: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="shrink-0 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-panel)] px-3.5 py-2">
      <p className="whitespace-nowrap text-[13px] leading-[18px] text-[var(--fh-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap font-[family-name:var(--font-display)] font-semibold tabular-nums leading-none",
          emphasize
            ? "text-[30px] text-[var(--fh-steel)]"
            : "text-[26px] text-[var(--fh-ink)]"
        )}
      >
        {value}
      </p>
      <p className="whitespace-nowrap text-[13px] leading-[18px] text-[var(--fh-muted)]">
        {hint}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  controls,
  children,
  className,
}: {
  title: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--fh-line)] bg-[var(--fh-panel)] px-3.5 py-3", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="shrink-0 text-lg font-semibold leading-tight text-[var(--fh-ink)]">
          {title}
        </h2>
        {controls}
      </div>
      <div className="mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded px-2 py-1 text-[13px] leading-none",
        active
          ? "bg-[var(--fh-steel)] text-white"
          : "text-[var(--fh-muted)] hover:text-[var(--fh-ink)]"
      )}
    >
      {children}
    </button>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-3 shrink-0"
      style={{ background: color }}
    />
  );
}

function CostPie({
  pie,
  withRetention,
}: {
  pie: CostSellingPie;
  withRetention: boolean;
}) {
  const loss = pie.loss;
  const slices = loss
    ? [
        {
          label: "Selling price",
          value: Math.max(0, pie.selling),
          color: STEEL,
        },
        { label: "Loss", value: Math.max(0, -pie.profit), color: LOSS },
      ]
    : [
        {
          label: withRetention ? "Cost" : "Cost incl. retention held",
          value: Math.max(0, pie.cost),
          color: PIE_COST,
        },
        { label: "Profit", value: Math.max(0, pie.profit), color: PIE_PROFIT },
      ];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const percents = piePercents(slices.map((slice) => slice.value));
  const paths = piePaths(slices, total);
  const labels = pieSliceLabels(slices, percents);
  const empty = total <= 0.005;

  return (
    <div className="flex min-h-0 flex-1 items-center gap-7">
      <div className="h-full max-w-[58%] shrink-0 aspect-square">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Cost against selling price"
        className="h-full w-full"
      >
        <style>
          {`.core-pie-percent { fill: #ffffff; stroke: #14232e; }
            html.dark .core-pie-percent { fill: #14232e; stroke: #ffffff; }
            html[data-theme="matrix"] .core-pie-percent { fill: #03140a; stroke: #021006; }`}
        </style>
        {empty ? (
          <circle cx="50" cy="50" r="46" fill={TRACK} />
        ) : paths.length === 1 ? (
          <circle cx="50" cy="50" r="46" fill={paths[0].color}>
            <title>{`${paths[0].label} ${formatCoreMoney(paths[0].value)}`}</title>
          </circle>
        ) : (
          paths.map((path) => (
            <path key={path.label} d={path.d} fill={path.color}>
              <title>{`${path.label} ${formatCoreMoney(path.value)} ${formatCorePercent(path.percent)}`}</title>
            </path>
          ))
        )}
        <circle cx="50" cy="50" r="24" fill={PANEL} />
        {labels.map((label) => (
          <text
            key={label.label}
            x={label.x.toFixed(2)}
            y={label.y.toFixed(2)}
            textAnchor="middle"
            dominantBaseline="central"
            className={label.color === PIE_PROFIT ? undefined : "core-pie-percent"}
            fill={
              label.color === PIE_PROFIT
                ? "var(--fh-figure-on-profit, #14232e)"
                : undefined
            }
            stroke={
              label.color === PIE_PROFIT
                ? "var(--fh-figure-on-profit-edge, #ffffff)"
                : undefined
            }
            strokeWidth="0.55"
            strokeLinejoin="round"
            fontSize="7"
            fontWeight="700"
            style={{
              fontFamily: "var(--font-display), sans-serif",
              paintOrder: "stroke fill",
            }}
          >
            {formatCorePercent(label.percent)}
          </text>
        ))}
      </svg>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-4">
        {slices.map((slice) => (
          <div key={slice.label} className="flex min-w-0 items-center gap-2.5">
            <Swatch color={slice.color} />
            <span
              className="text-lg leading-5"
              style={{ color: slice.color === LOSS ? LOSS : INK }}
            >
              {slice.label}
            </span>
            <span
              className="shrink-0 text-xl font-bold tabular-nums leading-5"
              style={{ color: slice.color === LOSS ? LOSS : INK }}
            >
              {formatCoreMoney(slice.value)}
            </span>
          </div>
        ))}
        <p
          className="text-[15px] leading-5"
          style={{
            color: loss ? LOSS : MUTED,
            fontWeight: loss ? 600 : 400,
          }}
        >
          {loss
            ? `Loss · cost ${formatCoreMoney(pie.cost)} is above selling ${formatCoreMoney(pie.selling)}`
            : `Selling price ${formatCoreMoney(pie.selling)}`}
        </p>
      </div>
    </div>
  );
}

function piePaths(
  slices: readonly { label: string; value: number; color: string }[],
  total: number
): { label: string; value: number; color: string; percent: number; d: string }[] {
  const percents = piePercents(slices.map((slice) => slice.value));
  const drawn = slices
    .map((slice, index) => ({ ...slice, percent: percents[index] ?? 0 }))
    .filter((slice) => slice.value > 0.005);
  if (drawn.length <= 1) {
    return drawn.map((slice) => ({ ...slice, d: "" }));
  }
  let angle = -Math.PI / 2;
  return drawn.map((slice) => {
    const sweep = total <= 0 ? 0 : (slice.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + Math.max(sweep, 0.0001);
    angle += sweep;
    const r = 46;
    const x1 = 50 + r * Math.cos(start);
    const y1 = 50 + r * Math.sin(start);
    const x2 = 50 + r * Math.cos(end);
    const y2 = 50 + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    const d = `M 50 50 L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    return { ...slice, d };
  });
}

function pieSliceLabels(
  slices: readonly { label: string; value: number; color: string }[],
  percents: readonly number[]
): { label: string; percent: number; color: string; x: number; y: number }[] {
  const drawn = slices
    .map((slice, index) => ({ ...slice, percent: percents[index] ?? 0 }))
    .filter((slice) => slice.value > 0.005);
  if (!drawn.length) return [];
  if (drawn.length === 1) return [{ ...drawn[0], x: 50, y: 15 }];
  const total = drawn.reduce((sum, slice) => sum + slice.value, 0);
  let angle = -Math.PI / 2;
  return drawn.map((slice) => {
    const sweep = total <= 0 ? 0 : (slice.value / total) * Math.PI * 2;
    const mid = angle + sweep / 2;
    angle += sweep;
    const radius = 35;
    return {
      ...slice,
      x: 50 + radius * Math.cos(mid),
      y: 50 + radius * Math.sin(mid),
    };
  });
}

function BillingChart({ bars }: { bars: BillingBar[] }) {
  if (!bars.length) {
    return <p className="text-sm text-[var(--fh-muted)]">No contracts yet.</p>;
  }
  const max = billingScaleMax(bars.map((bar) => bar.wo));
  return (
    <UprightBarChart
      ariaLabel="Billing progress: one upright bar per city, gold up to the amount billed. Cities is under 0.00L"
      axisLabel="Cities"
      legend={[
        { color: STEEL, label: "Work-order value" },
        { color: GOLD, label: "Amount billed" },
      ]}
      maxLabel={formatCoreMoney(max)}
      midLabel={formatCoreMoney(max / 2)}
      zeroLabel="0.00L"
      bars={bars.map((bar) => {
        const height = max <= 0 ? 0 : Math.min(1, Math.max(0, bar.wo) / max);
        const goldShare =
          bar.wo <= 0.005 ? 0 : Math.min(1, Math.max(0, bar.billed) / bar.wo);
        return {
          key: bar.key,
          label: bar.label,
          height,
          steelShare: 1 - goldShare,
          goldShare,
          totalLabel: formatCoreMoney(bar.wo),
          footLabel: formatCoreMoney(bar.billed),
          showGold: bar.billed > 0.005 && goldShare > 0,
        };
      })}
    />
  );
}

function UprightBarChart({
  ariaLabel,
  axisLabel,
  legend,
  maxLabel,
  midLabel,
  zeroLabel,
  bars,
}: {
  ariaLabel: string;
  axisLabel: string;
  legend: { color: string; label: string }[];
  maxLabel: string;
  midLabel: string;
  zeroLabel: string;
  bars: {
    key: string;
    label: string;
    height: number;
    steelShare: number;
    goldShare: number;
    totalLabel: string;
    footLabel: string;
    showGold: boolean;
  }[];
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        {legend.map((item) => (
          <LegendItem key={item.label} color={item.color} label={item.label} />
        ))}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <div className="flex w-max min-w-[4.4rem] shrink-0 flex-col">
          <div className="h-5 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col justify-between border-r border-[var(--fh-line)] pr-1 text-right text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
            <span>{maxLabel}</span>
            <span>{midLabel}</span>
            <span>{zeroLabel}</span>
          </div>
          <div className="mt-1 h-4 shrink-0" />
          <div className="h-4 shrink-0 whitespace-nowrap border-r border-transparent pr-1 text-right text-[11px] font-semibold leading-4 text-[var(--fh-ink)]">
            {axisLabel}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 gap-1 overflow-x-auto">
          {bars.map((bar) => (
            <div
              key={bar.key}
              className="flex h-full min-w-[3.6rem] flex-1 flex-col items-center"
            >
              <div className="h-5 shrink-0" />
              <div className="relative min-h-0 w-full flex-1">
                <div
                  className="absolute bottom-0 left-1/2 flex w-[68%] max-w-[46px] -translate-x-1/2 flex-col"
                  style={{ height: `${(bar.height * 100).toFixed(2)}%` }}
                >
                  <div className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                    {bar.totalLabel}
                  </div>
                  <div
                    className="min-h-0"
                    style={{ flex: `${bar.steelShare} 1 0`, background: STEEL }}
                  />
                  <div
                    style={{
                      flex: `${bar.goldShare} 1 0`,
                      background: GOLD,
                      minHeight: bar.showGold ? 2 : 0,
                    }}
                  />
                </div>
              </div>
              <div className="mt-1 h-4 shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                {bar.footLabel}
              </div>
              <div
                className="h-4 w-full truncate text-center text-[11px] font-semibold leading-4 text-[var(--fh-ink)]"
                title={bar.label}
              >
                {bar.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm leading-4 text-[var(--fh-ink)]">
      <Swatch color={color} />
      {label}
    </span>
  );
}

function OutstandingChart({
  overview,
}: {
  overview: ReturnType<typeof buildOutstandingOverview>;
}) {
  const max = billingScaleMax(overview.bars.map((bar) => bar.amount));
  return (
    <div
      role="img"
      aria-label="Receivables Overview: tax invoices by days until due, with overdue included in the total. Due in days is under 0.00L"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <p className="mb-1 flex shrink-0 items-center gap-2.5">
        <span className="text-sm leading-4 text-[var(--fh-ink)]">
          Total outstanding
        </span>
        <span className="shrink-0 text-sm tabular-nums leading-4 text-[var(--fh-ink)]">
          {formatCoreMoney(overview.total)}
        </span>
      </p>
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <div className="flex w-max min-w-[4.4rem] shrink-0 flex-col">
          <div className="h-5 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col justify-between border-r border-[var(--fh-line)] pr-1 text-right text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
            <span>{formatCoreMoney(max)}</span>
            <span>{formatCoreMoney(max / 2)}</span>
            <span>0.00L</span>
          </div>
          <div className="mt-1 h-4 shrink-0" />
          <div className="h-4 shrink-0 whitespace-nowrap border-r border-transparent pr-1 text-right text-[11px] font-semibold leading-4 text-[var(--fh-ink)]">
            Due in days
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 gap-1">
          {overview.bars.map((bar) => {
            const height = max <= 0 ? 0 : Math.min(1, Math.max(0, bar.amount) / max);
            const color = bar.key === "overdue" ? LOSS : STEEL;
            return (
              <div
                key={bar.key}
                className="flex h-full min-w-0 flex-1 flex-col items-center"
              >
                <div className="h-5 shrink-0" />
                <div className="relative min-h-0 w-full flex-1">
                  <div
                    className="absolute bottom-0 left-1/2 flex w-[70%] max-w-[42px] -translate-x-1/2 flex-col"
                    style={{ height: `${(height * 100).toFixed(2)}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                      {formatCoreMoney(bar.amount)}
                    </div>
                    <div className="min-h-0 flex-1" style={{ background: color }} />
                  </div>
                </div>
                <div className="mt-1 h-4 shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                  {bar.count}
                </div>
                <div
                  className="h-4 w-full truncate text-center text-[11px] font-semibold leading-4 text-[var(--fh-ink)]"
                  title={bar.label}
                >
                  {bar.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DepartmentChart({
  rows,
}: {
  rows: { name: string; open: number; overdue: number }[];
}) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--fh-muted)]">No open tasks.</p>;
  }
  const max = Math.max(...rows.map((row) => row.open));
  return (
    <UprightBarChart
      ariaLabel="Open tasks: one upright bar per department, gold up to the overdue count. Departments is under 0"
      axisLabel="Departments"
      legend={[
        { color: STEEL, label: "Ongoing" },
        { color: GOLD, label: "Overdue" },
      ]}
      maxLabel={formatCountTick(max)}
      midLabel={formatCountTick(max / 2)}
      zeroLabel="0"
      bars={rows.map((row) => {
        const height = max <= 0 ? 0 : Math.min(1, row.open / max);
        const goldShare =
          row.open <= 0 ? 0 : Math.min(1, Math.max(0, row.overdue) / row.open);
        return {
          key: row.name,
          label: row.name,
          height,
          steelShare: 1 - goldShare,
          goldShare,
          totalLabel: formatCountTick(row.open),
          footLabel: formatCountTick(row.overdue),
          showGold: row.overdue > 0 && goldShare > 0,
        };
      })}
    />
  );
}

function formatCountTick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
