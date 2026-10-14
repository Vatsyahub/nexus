"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  contractActualRetentionHold,
  taskIsOpen,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { departmentDisplayName } from "@/lib/types";
import { buildInvoiceOutstandingRows } from "@/lib/reports";
import {
  bankGuaranteeTotal,
  billingCityBars,
  comparisonValue,
  contractCities,
  contractCostAmount,
  contractExpenseTotal,
  costSellingPie,
  financialYear,
  formatCoreDay,
  formatCoreMoney,
  fyCollection,
  fyNetInvoiceValue,
  normalizeNexusCosts,
  todayIso,
  type BillingBar,
  type CostSellingPie,
} from "@/lib/nexus-core";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const selectClass =
  "h-[22px] max-w-[8.5rem] truncate rounded border border-[var(--fh-line)] bg-[var(--fh-panel)] px-1 text-[11px] text-[var(--fh-ink)]";

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
      if (row.outstanding <= 0.005) continue;
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
      className="flex h-full min-h-0 w-full flex-col items-start gap-6 overflow-hidden pr-4"
    >
      <header className="flex w-full shrink-0 items-end justify-between gap-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Nexus Core
        </h1>
        <Link
          href="/nexus-core/costs"
          className={cn(
            buttonVariants({ size: "sm" }),
            "h-[26px] bg-[var(--fh-steel)] px-2.5 text-xs text-white hover:bg-[var(--fh-steel)]/90"
          )}
        >
          Cost centre
        </Link>
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

      <div
        className="flex h-0 min-h-0 w-full flex-1 items-start justify-start overflow-hidden"
        style={{ containerType: "size" }}
      >
        <section
          data-core-grid
          className="grid gap-6"
          style={{
            width: "min(100cqw, 100cqh)",
            height: "min(100cqw, 100cqh)",
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
            <label className="flex items-center gap-1 text-[10px] text-[var(--fh-muted)]">
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
    <div className="shrink-0 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-panel)] px-3 py-2">
      <p className="whitespace-nowrap text-[11px] leading-4 text-[var(--fh-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "whitespace-nowrap font-[family-name:var(--font-display)] font-semibold tabular-nums leading-6",
          emphasize
            ? "text-[22px] text-[var(--fh-steel)]"
            : "text-xl text-[var(--fh-ink)]"
        )}
      >
        {value}
      </p>
      <p className="whitespace-nowrap text-[11px] leading-4 text-[var(--fh-muted)]">
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
    <section className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--fh-line)] bg-[var(--fh-panel)] px-3 py-2.5", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 className="shrink-0 text-xs font-semibold leading-4 text-[var(--fh-ink)]">
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
        "whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] leading-none",
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
      className="inline-block size-2 shrink-0"
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
  const paths = piePaths(slices, total);
  const empty = total <= 0.005;

  return (
    <div
      className="flex min-h-0 flex-1 items-center gap-3"
      style={{ containerType: "size" }}
    >
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Cost against selling price"
        className="shrink-0"
        style={{
          width: "min(100cqh, 48cqw)",
          height: "min(100cqh, 48cqw)",
        }}
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
              <title>{`${path.label} ${formatCoreMoney(path.value)}`}</title>
            </path>
          ))
        )}
        <circle cx="50" cy="50" r="24" fill={PANEL} />
      </svg>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1">
        {slices.map((slice) => (
          <div key={slice.label} className="flex min-w-0 items-center gap-1.5">
            <Swatch color={slice.color} />
            <span
              className="text-[12px] leading-4"
              style={{ color: slice.color === LOSS ? LOSS : INK }}
            >
              {slice.label}
            </span>
            <span
              className="shrink-0 text-[11px] font-semibold tabular-nums leading-[14px]"
              style={{ color: slice.color === LOSS ? LOSS : INK }}
            >
              {formatCoreMoney(slice.value)}
            </span>
          </div>
        ))}
        <p
          className="text-[10px] leading-[13px]"
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
): { label: string; value: number; color: string; d: string }[] {
  const drawn = slices.filter((slice) => slice.value > 0.005);
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

function BillingChart({ bars }: { bars: BillingBar[] }) {
  if (!bars.length) {
    return <p className="text-xs text-[var(--fh-muted)]">No contracts yet.</p>;
  }
  const maxL = niceMax(
    Math.max(...bars.map((bar) => Math.max(bar.wo, bar.billed))) / 100000
  );
  const ticks = [0, maxL / 2, maxL];

  return (
    <div
      role="img"
      aria-label="Billing progress: work-order value and amount billed by city"
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
        <LegendItem color={STEEL} label="Work-order value" />
        <LegendItem color={GOLD} label="Amount billed" />
        <span className="text-[11px] font-medium leading-4 text-[var(--fh-ink)]">
          Value (L)
        </span>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
        <div
          className="grid w-full min-w-0 items-center gap-x-2 gap-y-1.5"
          style={{ gridTemplateColumns: "max-content minmax(0, 1fr) auto" }}
        >
          {bars.map((bar) => (
            <div key={bar.key} className="contents">
              <div className="row-span-2 self-center whitespace-nowrap text-xs font-semibold leading-4 text-[var(--fh-ink)]">
                {bar.label}
              </div>
              <BillingHBar amount={bar.wo} maxL={maxL} color={STEEL} />
              <div className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold leading-4 tabular-nums text-[var(--fh-ink)]">
                <Swatch color={STEEL} />
                {formatCoreMoney(bar.wo)}
              </div>
              <BillingHBar amount={bar.billed} maxL={maxL} color={GOLD} />
              <div className="flex items-center gap-1 whitespace-nowrap text-xs font-semibold leading-4 tabular-nums text-[var(--fh-ink)]">
                <Swatch color={GOLD} />
                {formatCoreMoney(bar.billed)}
              </div>
            </div>
          ))}
          <span />
          <div className="flex justify-between text-[11px] font-medium leading-4 text-[var(--fh-ink)]">
            {ticks.map((tick) => (
              <span key={tick}>{formatCoreMoney(tick * 100000)}</span>
            ))}
          </div>
          <span />
        </div>
      </div>
    </div>
  );
}

function BillingHBar({
  amount,
  maxL,
  color,
}: {
  amount: number;
  maxL: number;
  color: string;
}) {
  const ratio = maxL <= 0 ? 0 : Math.min(1, amount / 100000 / maxL);
  const width =
    amount <= 0.005 ? "0px" : `max(2px, ${(ratio * 100).toFixed(2)}%)`;
  return (
    <div className="h-2.5 w-full min-w-0" style={{ background: TRACK }} title={formatCoreMoney(amount)}>
      <div style={{ width, height: "100%", background: color }} />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs leading-4 text-[var(--fh-ink)]">
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
    <div className="flex min-h-0 flex-1 flex-col gap-1">
      <div className="flex min-h-0 flex-1 items-end justify-center gap-10">
        {bars.map((bar) => {
          const ratio = maxL <= 0 ? 0 : Math.min(1, bar.amount / 100000 / maxL);
          const height =
            bar.amount > 0.005
              ? `max(4px, ${(ratio * 100).toFixed(2)}%)`
              : "2px";
          return (
            <div
              key={bar.label}
              className="flex h-full w-[6.5rem] flex-col items-center"
            >
              <div
                className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums leading-4"
                style={{ color: bar.color }}
              >
                {formatCoreMoney(bar.amount)}
              </div>
              <div className="mt-1 flex min-h-[3rem] w-full flex-1 items-end justify-center">
                <div className="w-7" style={{ height, background: bar.color }} />
              </div>
              <div className="mt-1 shrink-0 whitespace-nowrap text-xs font-semibold leading-4 text-[var(--fh-ink)]">
                {bar.label}
              </div>
              <div
                className="shrink-0 whitespace-nowrap text-[11px] leading-4"
                style={{ color: bar.color }}
              >
                {bar.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 justify-between px-6 text-[11px] leading-4 text-[var(--fh-muted)]">
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
    return <p className="text-xs text-[var(--fh-muted)]">No open tasks.</p>;
  }
  const maxOpen = niceMax(Math.max(...rows.map((row) => row.open)));
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
      <div className="my-1 flex shrink-0 flex-wrap gap-2.5">
        <LegendItem color={STEEL} label="Open, not overdue" />
        <LegendItem color={GOLD} label="Overdue" />
      </div>
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-[5px]">
        <div className="text-[9px] leading-3 text-[var(--fh-muted)]">
          Department
        </div>
        <div className="text-[9px] leading-3 text-[var(--fh-muted)]">
          Open tasks (count)
        </div>
        {rows.map((row) => {
          const resting = Math.max(0, row.open - row.overdue);
          return (
            <div key={row.name} className="contents">
              <div
                className="truncate text-[11px] leading-[14px] text-[var(--fh-ink)]"
                title={row.name}
              >
                {row.name}
              </div>
              <div>
                <div className="flex h-2" style={{ background: TRACK }}>
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
                <div className="text-[9px] tabular-nums leading-3 text-[var(--fh-muted)]">
                  {row.open} open, {row.overdue} overdue
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 grid grid-cols-[4.75rem_minmax(0,1fr)]">
        <span />
        <div className="flex justify-between text-[9px] leading-3 text-[var(--fh-muted)]">
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
