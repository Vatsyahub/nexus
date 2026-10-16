"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  paymentAccounted,
  paymentCash,
  paymentRecovered,
  useFlowhubData,
} from "@/lib/store";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ListSearchBar } from "@/components/list-search";
import { paymentMatchesQuery } from "@/lib/list-search";
import { paymentLinkLabel } from "@/lib/payment-display";
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

export default function PaymentsPage() {
  const data = useFlowhubData();
  const [q, setQ] = useState("");

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const payments = useMemo(() => {
    return data.payments
      .filter((p) => {
        const c = data.contracts.find((x) => x.id === p.contractId);
        const inv = p.invoiceId
          ? data.invoices.find((i) => i.id === p.invoiceId)
          : null;
        if (!paymentMatchesQuery(p, c, inv, q)) return false;
        if (filterFrom && p.date < filterFrom) return false;
        if (filterTo && p.date > filterTo) return false;
        return true;
      })
      .slice()
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
      );
  }, [data.payments, data.contracts, data.invoices, q, filterFrom, filterTo]);

  return (
    <HubPage className="max-w-5xl">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Payments
          </h1>
        </div>
        <Link
          href="/payments/new"
          className={cn(
            buttonVariants(),
            "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          )}
        >
          Add payment
        </Link>
      </div>

      <ListSearchBar
        value={q}
        onChange={setQ}
        placeholder="Search date, project, invoice, amount…"
      />

      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Payment list
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
        </div>

        <HubDataScroll className="space-y-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border border-[var(--fh-line)] text-left text-sm">
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {payments.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-[var(--fh-muted)]"
                  >
                    No payments match.
                  </td>
                </tr>
              ) : (
                payments.map((p) => {
                  const c = data.contracts.find((x) => x.id === p.contractId);
                  const inv = p.invoiceId
                    ? data.invoices.find((i) => i.id === p.invoiceId)
                    : null;
                  return (
                    <tr key={p.id} className="hover:bg-[var(--fh-bg)]/60">
                      <td className="px-3 py-2 font-medium">
                        <Link
                          href={`/payments/${p.id}`}
                          className="text-[var(--fh-steel)] hover:underline"
                        >
                          {c?.projectNo ?? "—"}
                        </Link>
                        <span className="mt-0.5 block text-xs font-normal text-[var(--fh-muted)]">
                          cash {formatMoney(paymentCash(p))}
                          {p.retentionAmount
                            ? ` · ret ${formatMoney(p.retentionAmount)}`
                            : ""}
                          {p.tdsAmount
                            ? ` · tds ${formatMoney(p.tdsAmount)}`
                            : ""}
                          {p.otherDeductions
                            ? ` · other ${formatMoney(p.otherDeductions)}`
                            : ""}
                          {paymentRecovered(p)
                            ? ` · recovered ${formatMoney(paymentRecovered(p))}`
                            : ""}
                          {` · accounted ${formatMoney(paymentAccounted(p))}`}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/payments/${p.id}`}
                          className="tabular-nums hover:underline"
                        >
                          {formatDisplayDate(p.date)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        <Link href={`/payments/${p.id}`} className="hover:underline">
                          {formatMoney(paymentCash(p))}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {inv ? (
                          <Link
                            href={`/billing/${inv.id}`}
                            className="text-[var(--fh-steel)] hover:underline"
                          >
                            {inv.type} {inv.number}
                          </Link>
                        ) : (
                          <Badge variant="secondary">
                            {paymentLinkLabel(p.link)}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </HubDataScroll>
      </section>
    </HubPage>
  );
}
