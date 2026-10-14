"use client";

import Link from "next/link";
import {
  invoiceDueDate,
  invoiceOutstanding,
  taskIsOpen,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { HUB_NAME, HUB_TAGLINE } from "@/lib/types";
import { contractDisplayStatus, todayIso as statusToday } from "@/lib/nexus-core";
import { formatDisplayDate } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function localIso(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Rupees → lakhs, two decimals: 200000 → "2.00L", 80000 → "0.80L". */
function lakhs(n: number) {
  return `${(n / 100000).toFixed(2)}L`;
}

function StatCard({
  label,
  value,
  unit,
  href,
  disabled,
}: {
  label: string;
  value: string | number;
  unit?: string;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tabular-nums text-[var(--fh-steel)]">
        {value}
        {unit && (
          <span className="ml-1 font-sans text-xs font-normal text-[var(--fh-muted)]">
            {unit}
          </span>
        )}
      </p>
      {disabled && (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--fh-muted)]">
          Coming soon
        </p>
      )}
    </>
  );

  const className = cn(
    "rounded-lg border border-[var(--fh-line)] bg-[var(--fh-panel)] p-3 shadow-sm transition",
    href && !disabled && "hover:border-[var(--fh-steel)]/40 hover:bg-white",
    disabled && "cursor-default opacity-80"
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} aria-disabled={disabled || undefined}>
      {inner}
    </div>
  );
}

export default function HomePage() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const todayKey = statusToday();
  const active = data.contracts.filter(
    (c) => contractDisplayStatus(data, c, todayKey) === "Active"
  ).length;
  const pendingTasks = data.tasks.filter(
    (t) => !t.parentId && taskIsOpen(t)
  ).length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueTasks = data.tasks.filter((t) => {
    if (t.parentId || !taskIsOpen(t) || !t.dueDate) return false;
    const due = new Date(t.dueDate);
    due.setHours(0, 0, 0, 0);
    return due < today;
  }).length;

  const todayIso = localIso(today);
  const in7 = new Date(today);
  in7.setDate(in7.getDate() + 7);
  const in7Iso = localIso(in7);

  let paymentDueTotal = 0;
  let paymentDue7Total = 0;
  for (const ti of data.invoices) {
    if (ti.type !== "TI") continue;
    const dueAmt = invoiceOutstanding(ti, data);
    if (dueAmt <= 0.005) continue;
    paymentDueTotal += dueAmt;
    const dueDate = invoiceDueDate(ti, data);
    if (dueDate >= todayIso && dueDate <= in7Iso) paymentDue7Total += dueAmt;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--fh-line)] bg-[var(--fh-steel)] px-6 py-16 text-white sm:px-12 sm:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 30% 20%, rgba(183,201,196,0.35), transparent 55%), linear-gradient(160deg, transparent 45%, rgba(20,35,46,0.45) 100%)",
          }}
        />
        <div className="relative text-center sm:text-left">
          <h1 className="nexus-wordmark font-[family-name:var(--font-brand)] text-7xl font-semibold leading-none tracking-tight sm:text-8xl md:text-9xl">
            {HUB_NAME}
          </h1>
          <p className="mx-auto mt-8 max-w-xl font-[family-name:var(--font-brand)] text-xl font-medium tracking-wide text-[#f7d3b5] sm:mx-0 sm:text-2xl">
            {HUB_TAGLINE}
          </p>
        </div>
        <div className="pointer-events-none absolute top-1/2 right-6 hidden -translate-y-1/2 flex-col items-center lg:flex sm:right-12">
          <img src="/cradle-mark.png" alt="" className="h-[7.5rem] w-auto" />
          <p className="mt-1 text-center font-[family-name:var(--font-brand)] text-[1.40625rem] font-semibold leading-none tracking-wide text-white">
            Cradle Runways
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Active contracts"
          value={ready ? active : "…"}
          href="/contracts"
        />
        <StatCard
          label="Payments due"
          value={ready ? lakhs(paymentDueTotal) : "…"}
          href="/reports/outstanding?tab=outstandings"
        />
        <StatCard
          label="Payments due in 7 days"
          value={ready ? lakhs(paymentDue7Total) : "…"}
          href="/reports/outstanding?tab=outstandings&dueWithin=7"
        />
        <StatCard
          label="Pending tasks"
          value={ready ? pendingTasks : "…"}
          href="/tasks?filter=pending"
        />
        <StatCard
          label="Tasks due"
          value={ready ? dueTasks : "…"}
          href="/tasks?filter=overdue"
        />
      </section>

      <section className="rounded-xl border border-[var(--fh-line)] bg-[var(--fh-panel)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--fh-steel)]">
            Recent contracts
          </h2>
          <Badge variant="secondary">
            {ready ? `${data.contracts.length} total` : "Loading…"}
          </Badge>
        </div>
        {!ready ? (
          <p className="mt-3 text-sm text-[var(--fh-muted)]">
            Loading workspace from server…
          </p>
        ) : data.contracts.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--fh-muted)]">
            No contracts yet. Use Contracts in the left menu to create one.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--fh-line)]">
            {data.contracts
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.closureDate || a.createdAt).getTime() -
                  new Date(b.closureDate || b.createdAt).getTime()
              )
              .slice(0, 3)
              .map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/contracts/${c.id}`}
                      className="line-clamp-1 text-sm font-medium text-[var(--fh-steel)] hover:underline"
                    >
                      {c.projectName}
                    </Link>
                    <p className="text-[11px] text-[var(--fh-muted)]">
                      {c.projectNo} · Closure{" "}
                      {formatDisplayDate(c.closureDate)}
                    </p>
                  </div>
                  <Badge
                    variant={
                      contractDisplayStatus(data, c, todayKey) === "Active"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {contractDisplayStatus(data, c, todayKey)}
                  </Badge>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
