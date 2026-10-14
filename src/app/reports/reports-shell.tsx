"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { defaultAccess, reportDoorForHref } from "@/lib/access";
import { cn } from "@/lib/utils";

const LIVE_REPORTS = [
  {
    href: "/reports/outstanding",
    label: "Invoices and Outstandings",
  },
  {
    href: "/reports/sales",
    label: "Sales",
  },
  {
    href: "/reports/accounts",
    label: "Accounts",
  },
  {
    href: "/reports/reconciliation",
    label: "Reconciliation",
  },
  {
    href: "/reports/execution",
    label: "Operations",
  },
  {
    href: "/reports/other",
    label: "Other reports",
  },
] as const;

export function ReportsNav() {
  const pathname = usePathname();
  const { data } = useSession();
  const access =
    data?.user?.access ?? defaultAccess(data?.user?.clearance ?? "user");
  const visible = LIVE_REPORTS.filter((r) => {
    const door = reportDoorForHref(r.href);
    if (!door) return true;
    return access[door] !== "block";
  });
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {visible.map((r) => {
        const active = pathname === r.href || pathname.startsWith(`${r.href}/`);
        return (
          <Link
            key={r.href}
            href={r.href}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-[var(--fh-steel)] bg-[var(--fh-steel)] text-white"
                : "border-[var(--fh-line)] bg-white text-[var(--fh-steel)] hover:border-[var(--fh-steel)]/40"
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </div>
  );
}

export function ReportsHeader({ title }: { title: string }) {
  return (
    <div className="shrink-0 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
          Reports
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          {title}
        </h1>
      </div>
      <ReportsNav />
    </div>
  );
}

export function ReportsLoading() {
  return (
    <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
      Loading workspace from server…
    </p>
  );
}

export function ReportsEmpty({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-[var(--fh-line)] bg-white px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
      {message}
    </p>
  );
}

/**
 * Report list table frame. Tables must fit the viewport width — no horizontal
 * scroll. Use `w-full table-fixed`, wrap text (`break-words`), and densify money
 * columns (`text-xs tabular-nums`, tight padding). The frame fills leftover
 * height and scrolls the rows on the right.
 */
export function ReportsTableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-hub-data-scroll=""
      className={cn(
        "min-h-24 w-full max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-[var(--fh-line)] [scrollbar-gutter:stable]",
        className
      )}
    >
      {children}
    </div>
  );
}

/** White report panel that fills the viewport under the page header. */
export const reportPanelClass =
  "flex min-h-0 flex-1 flex-col overflow-y-auto rounded-xl border border-[var(--fh-line)] bg-white p-5";

/** Shared cell classes for report tables that must fit page width. */
export const reportTh =
  "px-1.5 py-2 align-bottom text-[10px] font-medium leading-tight break-words sm:px-2 sm:text-xs";
export const reportTd =
  "px-1.5 py-2 align-top text-xs break-words sm:px-2 sm:text-sm";
export const reportMoney =
  "px-1 py-2 text-right align-top text-[11px] tabular-nums leading-snug break-all sm:px-1.5 sm:text-xs";

export { LIVE_REPORTS };
