"use client";

import { useMemo, useState } from "react";
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
  comparisonValue,
  contractCities,
  contractCostAmount,
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
const TRACK = "var(--fh-line)";
const PANEL = "var(--fh-panel)";

export default function NexusCorePage() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const [billCity, setBillCity] = useState("");
  const [withRetention, setWithRetention] = useState(true);

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
  const cities = useMemo(() => contractCities(contracts), [contracts]);

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
    () => billingCityBars(contracts, data, billCity),
    [contracts, billCity, data]
  );

  const outstanding = useMemo(() => {
    const rows = buildInvoiceOutstandingRows(data);
    let currentDue = 0;
    let currentCount = 0;
    let overdue = 0;
    let overdueCount = 0;
    for (const row of rows) {
      if (!outstandingIsStillDue(row.outstanding)) continue;
      if (row.status === "overdue") {
        overdue += row.outstanding;
        overdueCount += 1;
      } else if (row.status === "due" || row.status === "partially paid") {
        currentDue += row.outstanding;
        currentCount += 1;
      }
    }
    return { currentDue, currentCount, overdue, overdueCount };
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
            href="/nexus-core/report"
            className={cn(
              buttonVariants(),
              "h-auto bg-[var(--fh-steel)] px-4 py-2 text-sm text-white hover:bg-[var(--fh-steel)]/90"
            )}
          >
            Core report
          </Link>
          <Link
            href="/nexus-core/costs"
            className={cn(
              buttonVariants(),
              "h-auto bg-[var(--fh-steel)] px-4 py-2 text-sm text-white hover:bg-[var(--fh-steel)]/90"
            )}
          >
            Cost centre
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
          title="Cost and selling price"
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
          title="Billing progress"
          controls={
            <label className="flex items-center gap-1.5 text-[13px] text-[var(--fh-muted)]">
              City
              <select
                id="bill-city"
                aria-label="City"
                data-billing-filter="cities"
                className={selectClass}
                value={billCity}
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

        <ChartCard title="Outstanding tax invoices">
          <OutstandingChart
            currentDue={outstanding.currentDue}
            currentCount={outstanding.currentCount}
            overdue={outstanding.overdue}
            overdueCount={outstanding.overdueCount}
          />
        </ChartCard>

        <ChartCard title="Open tasks">
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
          color: STEEL,
        },
        { label: "Profit", value: Math.max(0, pie.profit), color: GOLD },
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
            fill={label.color === GOLD ? INK : "#ffffff"}
            fontSize="4.6"
            fontWeight="700"
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
  const mid = max / 2;

  return (
    <div
      role="img"
      aria-label="Billing progress: one upright bar per city, gold up to the amount billed"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        <LegendItem color={STEEL} label="Work-order value" />
        <LegendItem color={GOLD} label="Amount billed" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 gap-2">
        <div className="flex w-[4.4rem] shrink-0 flex-col">
          <div className="h-5 shrink-0" />
          <div className="flex min-h-0 flex-1 flex-col justify-between border-r border-[var(--fh-line)] pr-1 text-right text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
            <span>{formatCoreMoney(max)}</span>
            <span>{formatCoreMoney(mid)}</span>
            <span>0.00L</span>
          </div>
          <div className="h-9 shrink-0" />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 gap-1 overflow-x-auto">
          {bars.map((bar) => {
            const height = max <= 0 ? 0 : Math.min(1, Math.max(0, bar.wo) / max);
            const billedShare =
              bar.wo <= 0.005 ? 0 : Math.min(1, Math.max(0, bar.billed) / bar.wo);
            const steelShare = 1 - billedShare;
            return (
              <div
                key={bar.key}
                className="flex h-full min-w-[3.6rem] flex-1 flex-col items-center"
              >
                <div className="h-5 shrink-0" />
                <div className="relative min-h-0 w-full flex-1">
                  <div
                    className="absolute bottom-0 left-1/2 flex w-[68%] max-w-[46px] -translate-x-1/2 flex-col"
                    style={{ height: `${(height * 100).toFixed(2)}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 mb-0.5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                      {formatCoreMoney(bar.wo)}
                    </div>
                    <div
                      className="min-h-0"
                      style={{ flex: `${steelShare} 1 0`, background: STEEL }}
                    />
                    <div
                      style={{
                        flex: `${billedShare} 1 0`,
                        background: GOLD,
                        minHeight: bar.billed > 0.005 && billedShare > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                </div>
                <div className="mt-1 h-4 shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums leading-none text-[var(--fh-ink)]">
                  {formatCoreMoney(bar.billed)}
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

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm leading-4 text-[var(--fh-ink)]">
      <Swatch color={color} />
      {label}
    </span>
  );
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function OutstandingChart({
  currentDue,
  currentCount,
  overdue,
  overdueCount,
}: {
  currentDue: number;
  currentCount: number;
  overdue: number;
  overdueCount: number;
}) {
  const maxL = niceMax(Math.max(currentDue, overdue) / 100000);
  const bars = [
    {
      label: "Current due",
      count: `${currentCount} TI due`,
      amount: currentDue,
      color: STEEL,
    },
    {
      label: "Overdue",
      count: `${overdueCount} TI overdue`,
      amount: overdue,
      color: LOSS,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-2 items-end gap-9 px-4">
        {bars.map((bar) => {
          const ratio = maxL <= 0 ? 0 : Math.min(1, bar.amount / 100000 / maxL);
          const height =
            bar.amount > 0.005
              ? `max(4px, ${(ratio * 100).toFixed(2)}%)`
              : "2px";
          return (
            <div
              key={bar.label}
              className="flex h-full min-w-0 flex-col items-center"
            >
              <div
                className="shrink-0 whitespace-nowrap font-[family-name:var(--font-display)] text-[32px] font-semibold tabular-nums leading-none"
                style={{ color: bar.color }}
              >
                {formatCoreMoney(bar.amount)}
              </div>
              <div className="mt-2 flex min-h-[3rem] w-full flex-1 items-end justify-center">
                <div
                  className="w-[38%] min-w-[84px] max-w-[140px]"
                  style={{ height, background: bar.color }}
                />
              </div>
              <div className="mt-2 shrink-0 whitespace-nowrap text-lg font-semibold leading-tight text-[var(--fh-ink)]">
                {bar.label}
              </div>
              <div
                className="shrink-0 whitespace-nowrap text-sm leading-5"
                style={{ color: bar.color }}
              >
                {bar.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 justify-between px-8 pt-1.5 text-[13px] leading-4 text-[var(--fh-muted)]">
        <span>0.00L</span>
        <span>{formatCoreMoney(maxL * 100000)}</span>
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
  const maxOpen = niceMax(Math.max(...rows.map((row) => row.open)));
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="mb-2 flex shrink-0 flex-wrap gap-4">
        <LegendItem color={STEEL} label="Open, not overdue" />
        <LegendItem color={GOLD} label="Overdue" />
      </div>
      <div className="grid shrink-0 grid-cols-[7.4rem_minmax(0,1fr)] items-center gap-x-3">
        <div className="text-[13px] leading-4 text-[var(--fh-muted)]">
          Department
        </div>
        <div className="text-[13px] leading-4 text-[var(--fh-muted)]">
          Open tasks (count)
        </div>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-3 overflow-auto">
        {rows.map((row) => {
          const resting = Math.max(0, row.open - row.overdue);
          return (
            <div
              key={row.name}
              className="grid shrink-0 grid-cols-[7.4rem_minmax(0,1fr)] items-center gap-x-3"
            >
              <div
                className="truncate text-[15px] leading-5 text-[var(--fh-ink)]"
                title={row.name}
              >
                {row.name}
              </div>
              <div>
                <div className="flex h-7" style={{ background: TRACK }}>
                  <div
                    style={{
                      width: `${(resting / maxOpen) * 100}%`,
                      background: STEEL,
                    }}
                  />
                  <div
                    style={{
                      width: `${(row.overdue / maxOpen) * 100}%`,
                      background: GOLD,
                    }}
                  />
                </div>
                <div className="mt-0.5 text-[13px] tabular-nums leading-4 text-[var(--fh-muted)]">
                  {row.open} open, {row.overdue} overdue
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-[7.4rem_minmax(0,1fr)]">
        <span />
        <div className="flex justify-between text-[13px] leading-4 text-[var(--fh-muted)]">
          <span>0</span>
          <span>{formatCountTick(maxOpen / 2)}</span>
          <span>{formatCountTick(maxOpen)}</span>
        </div>
      </div>
    </div>
  );
}

function formatCountTick(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
