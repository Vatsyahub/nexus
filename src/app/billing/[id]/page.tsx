"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  deleteInvoice,
  flushWorkspace,
  invoiceDueDate,
  invoiceExpectedCash,
  invoiceOutstanding,
  paymentAccounted,
  paymentCash,
  useFlowhubData,
} from "@/lib/store";
import { COMPANY_NAME, TERM_LABELS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { confirmAction } from "@/components/confirm-panel";
import { DeleteIconButton, EditIconLink } from "@/components/icon-actions";
import { formatDisplayDate } from "@/lib/dates";
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

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const id = String(params.id);
  const data = useFlowhubData();
  const inv = data.invoices.find((i) => i.id === id);
  const contract = data.contracts.find((c) => c.id === inv?.contractId);

  if (!inv || !contract) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Invoice not found.</p>
        <Link href="/billing" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>
    );
  }

  const due = inv.type === "TI" ? invoiceOutstanding(inv, data) : null;
  const extras = inv.extraCharges ?? [];
  const expected = invoiceExpectedCash(inv, data);
  const dueDate = inv.type === "TI" ? invoiceDueDate(inv, data) : null;
  const invoice = inv;
  const linkedPayments = data.payments.filter((p) => p.invoiceId === invoice.id);
  const isMaster = session?.user?.clearance === "master";
  const showDelete =
    invoice.type === "PI" || (status === "authenticated" && isMaster);

  async function onDelete() {
    const kind = invoice.type === "PI" ? "Proforma Invoice" : "Tax Invoice";
    const ok = await confirmAction({
      message: `Delete ${kind} ${invoice.number}?`,
      action: "Delete",
    });
    if (!ok) return;
    if (!deleteInvoice(id)) return;
    await flushWorkspace();
    router.push("/billing");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/billing"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to billing
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{inv.type}</Badge>
          <EditIconLink href={`/billing/${id}/edit`} label="Edit invoice" />
          {showDelete ? (
            <DeleteIconButton
              label={
                inv.type === "PI"
                  ? "Delete proforma"
                  : "Delete tax invoice"
              }
              onClick={() => void onDelete()}
            />
          ) : null}
        </div>
      </div>

      <article className="rounded-xl border border-[var(--fh-line)] bg-white p-6 sm:p-8 shadow-sm">
        <header className="border-b border-[var(--fh-line)] pb-6">
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            {COMPANY_NAME}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
            {inv.type === "PI" ? "Proforma Invoice" : "Tax Invoice"}
          </h1>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-[var(--fh-muted)]">Number:</span> {inv.number}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Date:</span>{" "}
              {formatDisplayDate(inv.date)}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Project:</span>{" "}
              {contract.projectName}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Project no:</span>{" "}
              {contract.projectNo}
            </p>
            <p className="sm:col-span-2">
              <span className="text-[var(--fh-muted)]">Location:</span>{" "}
              {contract.city}, {contract.state}, {contract.country}
            </p>
          </div>
        </header>

        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--fh-line)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
              <th className="py-2 pr-2 font-medium">Item</th>
              <th className="py-2 pr-2 font-medium">Term</th>
              <th className="py-2 pr-2 font-medium text-right">Qty</th>
              <th className="py-2 pr-2 font-medium text-right">Rate</th>
              <th className="py-2 font-medium text-right">%</th>
              <th className="py-2 font-medium text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {inv.lines.map((l, i) => (
              <tr key={`${l.boqItemId}-${l.termKey}-${i}`}>
                <td className="py-2 pr-2">{l.itemName}</td>
                <td className="py-2 pr-2">{TERM_LABELS[l.termKey] ?? l.termKey}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{l.billedQty}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatMoney(l.rate)}
                </td>
                <td className="py-2 text-right tabular-nums">{l.termPercent}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatMoney(l.lineNet)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 space-y-1 border-t border-[var(--fh-line)] pt-4 text-sm">
          <div className="flex justify-between">
            <span>Net</span>
            <span className="tabular-nums">{formatMoney(inv.netAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span>GST</span>
            <span className="tabular-nums">{formatMoney(inv.gstAmount)}</span>
          </div>
          {extras.map((e) => (
            <div
              key={e.id}
              className="flex justify-between text-[var(--fh-muted)]"
            >
              <span>{e.label}</span>
              <span className="tabular-nums">{formatMoney(e.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-[var(--fh-line)] pt-2 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(inv.finalAmount)}</span>
          </div>
          <div className="flex justify-between text-[var(--fh-muted)]">
            <span>Expected cash</span>
            <span className="tabular-nums">{formatMoney(expected)}</span>
          </div>
          {dueDate && (
            <div className="flex justify-between text-[var(--fh-muted)]">
              <span>Due date</span>
              <span className="tabular-nums">
                {formatDisplayDate(dueDate)}
              </span>
            </div>
          )}
          {due != null && (
            <p className="pt-2 text-sm font-medium text-[var(--fh-steel)]">
              Balance: {balanceLabel(due)}
            </p>
          )}
          <p className="text-xs text-[var(--fh-muted)]">
            Expected cash = total − retention − TDS on net. Retention and TDS
            settle the invoice but are not due as cash.
          </p>
        </div>
      </article>

      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Payments on this invoice
        </h2>
        {linkedPayments.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--fh-muted)]">No payments linked yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--fh-line)] text-sm">
            {linkedPayments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-start justify-between gap-2 py-3"
              >
                <div>
                  <Link
                    href={`/payments/${p.id}`}
                    className="font-medium text-[var(--fh-steel)] hover:underline"
                  >
                    {formatDisplayDate(p.date)}
                  </Link>
                  <p className="text-xs text-[var(--fh-muted)]">
                    cash {formatMoney(paymentCash(p))}
                    {p.retentionAmount
                      ? ` · ret ${formatMoney(p.retentionAmount)}`
                      : ""}
                    {p.tdsAmount ? ` · tds ${formatMoney(p.tdsAmount)}` : ""}
                    {p.otherDeductions
                      ? ` · other ${formatMoney(p.otherDeductions)}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums font-medium">
                    {formatMoney(paymentAccounted(p))}
                  </p>
                  <p className="text-xs text-[var(--fh-muted)]">accounted</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
