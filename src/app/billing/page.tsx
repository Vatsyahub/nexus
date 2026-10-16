"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  invoiceDueDate,
  invoiceExpectedCash,
  invoiceOutstanding,
  useFlowhubData,
} from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function balanceLabel(amount: number) {
  if (amount > 0.005) return `Due ${formatMoney(amount)}`;
  if (amount < -0.005) return `Extra ${formatMoney(-amount)}`;
  return "Paid";
}

export default function BillingHomePage() {
  const data = useFlowhubData();

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PI" | "TI">("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const listed = useMemo(() => {
    return data.invoices
      .filter((inv) => {
        const c = data.contracts.find((x) => x.id === inv.contractId);
        const due =
          inv.type === "TI" ? invoiceDueDate(inv, data) : null;
        if (!invoiceMatchesQuery(inv, c, q, { dueDate: due })) return false;
        if (typeFilter !== "ALL" && inv.type !== typeFilter) return false;
        if (from && inv.date < from) return false;
        if (to && inv.date > to) return false;
        return true;
      })
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data, q, typeFilter, from, to]);

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Billing
          </h1>
        </div>
        <Link
          href="/billing/new"
          className={cn(
            buttonVariants(),
            "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          )}
        >
          Add Invoice
        </Link>
      </div>

      <ListSearchBar
        value={q}
        onChange={setQ}
        placeholder="Search invoice no., date, project, amount…"
      />

      <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          All invoices
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="ALL">All</option>
              <option value="PI">Proforma Invoice</option>
              <option value="TI">Tax Invoice</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From date</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To date</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <HubDataScroll className="overflow-x-auto rounded-lg border border-[var(--fh-line)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">Total</th>
                <th className="px-3 py-2 font-medium text-right">Expected payment</th>
                <th className="px-3 py-2 font-medium">Due date</th>
                <th className="px-3 py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {listed.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--fh-muted)]">
                    No invoices match.
                  </td>
                </tr>
              ) : (
                listed.map((inv) => {
                  const c = data.contracts.find((x) => x.id === inv.contractId);
                  const expected = invoiceExpectedCash(inv, data);
                  const dueDate = inv.type === "TI" ? invoiceDueDate(inv, data) : "—";
                  const due = inv.type === "TI" ? invoiceOutstanding(inv, data) : null;
                  return (
                    <tr key={inv.id}>
                      <td className="px-3 py-2">
                        <Link
                          href={`/billing/${inv.id}`}
                          className="font-medium text-[var(--fh-steel)] hover:underline"
                        >
                          {inv.type} {inv.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[var(--fh-muted)]">
                        {c?.projectNo ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatDisplayDate(inv.date)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatMoney(inv.finalAmount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(expected)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {dueDate === "—"
                          ? "—"
                          : formatDisplayDate(dueDate)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {due == null ? (
                          <span className="text-[var(--fh-muted)]">—</span>
                        ) : (
                          <Badge variant="secondary">{balanceLabel(due)}</Badge>
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
