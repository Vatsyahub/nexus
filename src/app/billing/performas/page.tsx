"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useListFilters } from "@/lib/use-view-query";
import { useFlowhubData } from "@/lib/store";
import { buttonVariants } from "@/components/ui/button";
import { ListSearchBar } from "@/components/list-search";
import { invoiceMatchesQuery } from "@/lib/list-search";
import { formatDisplayDate } from "@/lib/dates";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function daysSince(isoDate: string) {
  const created = new Date(isoDate);
  created.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - created.getTime()) / 86400000);
}

export default function OpenPerformasPage() {
  return (
    <Suspense fallback={null}>
      <OpenPerformasInner />
    </Suspense>
  );
}

function OpenPerformasInner() {
  const data = useFlowhubData();
  const router = useRouter();
  const { q, setQ } = useListFilters();

  const openPis = useMemo(() => {
    return data.invoices
      .filter((i) => i.type === "PI")
      .filter((i) => {
        const c = data.contracts.find((x) => x.id === i.contractId);
        return invoiceMatchesQuery(i, c, q);
      })
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.invoices, data.contracts, q]);

  return (
    <HubPage className="max-w-4xl">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Open performas
          </h1>
          <p className="mt-1 text-sm text-[var(--fh-muted)]">
            {openPis.length} open proforma
            {openPis.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/billing/convert"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            One-click PI → TI
          </Link>
          <Link
            href="/billing"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Billing home
          </Link>
        </div>
      </div>

      <ListSearchBar
        value={q}
        onChange={setQ}
        placeholder="Search PI no., date, project, amount…"
      />

      <HubDataScroll>
      <ul className="divide-y divide-[var(--fh-line)] rounded-xl border border-[var(--fh-line)] bg-white">
        {openPis.length === 0 ? (
          <li className="p-6 text-center text-sm text-[var(--fh-muted)]">
            No open performas.
          </li>
        ) : (
          openPis.map((pi) => {
            const c = data.contracts.find((x) => x.id === pi.contractId);
            return (
              <li
                key={pi.id}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-[var(--fh-bg)]/80"
                onClick={() => router.push(`/billing/${pi.id}`)}
              >
                <div>
                  <Link
                    href={`/billing/${pi.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-[var(--fh-steel)] hover:underline"
                  >
                    {pi.number}
                  </Link>
                  <p className="text-xs text-[var(--fh-muted)]">
                    {c?.projectNo} · {formatDisplayDate(pi.date)} · open{" "}
                    {daysSince(pi.createdAt)} days
                  </p>
                </div>
                <span className="tabular-nums font-medium">
                  {formatMoney(pi.finalAmount)}
                </span>
              </li>
            );
          })
        )}
      </ul>
      </HubDataScroll>
    </HubPage>
  );
}
