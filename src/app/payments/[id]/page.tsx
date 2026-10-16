"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deletePayment,
  flushWorkspace,
  invoiceOutstanding,
  paymentAccounted,
  paymentCash,
  paymentRecovered,
  recoverableRunningLineFigures,
  useFlowhubData,
} from "@/lib/store";
import { COMPANY_NAME } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { confirmAction } from "@/components/confirm-panel";
import {
  DeleteIconButton,
  EditIconLink,
} from "@/components/icon-actions";
import { formatDisplayDate } from "@/lib/dates";
import {
  formatOtherDeductions,
  formatRecoverableRunningLine,
  paymentLinkLabel,
} from "@/lib/payment-display";
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

export default function PaymentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const data = useFlowhubData();
  const payment = data.payments.find((p) => p.id === id);
  const contract = data.contracts.find((c) => c.id === payment?.contractId);
  const invoice = payment?.invoiceId
    ? data.invoices.find((i) => i.id === payment.invoiceId)
    : null;

  if (!payment || !contract) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Payment not found.</p>
        <Link href="/payments" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>
    );
  }

  const cash = paymentCash(payment);
  const accounted = paymentAccounted(payment);
  const recoveredAmount = paymentRecovered(payment);
  const contractHasRecoverable = data.payments.some(
    (p) => p.contractId === payment.contractId && p.link === "recoverable"
  );
  const showRecovered =
    payment.link === "TI" && (contractHasRecoverable || recoveredAmount > 0);
  const poolFigures = recoverableRunningLineFigures(
    data.payments,
    payment.contractId,
    {
      exceptPaymentId: payment.link === "TI" ? payment.id : null,
      thisEntry: payment.link === "TI" ? recoveredAmount : 0,
    }
  );
  const poolLine = formatRecoverableRunningLine(
    poolFigures.recovered,
    poolFigures.pool
  );
  const invoiceBalance =
    invoice?.type === "TI" ? invoiceOutstanding(invoice, data) : null;

  async function onDelete() {
    if (
      !(await confirmAction({
        message: "Delete this payment? This cannot be undone.",
        action: "Delete",
      }))
    ) {
      return;
    }
    deletePayment(id);
    await flushWorkspace();
    router.push("/payments");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/payments"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to payments
        </Link>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{paymentLinkLabel(payment.link)}</Badge>
          <EditIconLink href={`/payments/${id}/edit`} label="Edit payment" />
          <DeleteIconButton label="Delete payment" onClick={onDelete} />
        </div>
      </div>

      <article className="rounded-xl border border-[var(--fh-line)] bg-white p-6 sm:p-8 shadow-sm">
        <header className="border-b border-[var(--fh-line)] pb-6">
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            {COMPANY_NAME}
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
            Payment
          </h1>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-[var(--fh-muted)]">Date:</span>{" "}
              {formatDisplayDate(payment.date)}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Project:</span>{" "}
              {contract.projectName}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Project no:</span>{" "}
              {contract.projectNo}
            </p>
            <p>
              <span className="text-[var(--fh-muted)]">Link:</span>{" "}
              {invoice ? (
                <Link
                  href={`/billing/${invoice.id}`}
                  className="text-[var(--fh-steel)] hover:underline"
                >
                  {invoice.type} {invoice.number}
                </Link>
              ) : (
                paymentLinkLabel(payment.link)
              )}
            </p>
          </div>
        </header>

        <div className="mt-6 space-y-2 text-sm">
          <Row label="Cash — net" value={formatMoney(payment.netAmount)} />
          <Row label="Cash — GST" value={formatMoney(payment.gstAmount)} />
          <Row
            label="Cash received"
            value={formatMoney(cash)}
            strong
          />
          <Row
            label="Retention (held)"
            value={formatMoney(payment.retentionAmount)}
          />
          <Row label="TDS (held)" value={formatMoney(payment.tdsAmount)} />
          <Row
            label="Other deductions"
            value={formatOtherDeductions(
              payment.otherDeductions,
              payment.otherDeductionReason
            )}
          />
          {showRecovered && (
            <>
              <Row label="Recovered" value={formatMoney(recoveredAmount)} />
              <p className="text-xs text-[var(--fh-muted)]">{poolLine}</p>
            </>
          )}
          {payment.link === "recoverable" && (
            <p className="text-xs text-[var(--fh-muted)]">{poolLine}</p>
          )}
          <div className="flex justify-between border-t border-[var(--fh-line)] pt-2 text-base font-semibold">
            <span>Accounted toward invoice</span>
            <span className="tabular-nums">{formatMoney(accounted)}</span>
          </div>
          <p className="pt-2 text-xs text-[var(--fh-muted)]">
            Accounted = cash + retention + TDS + other. Retention and TDS are
            not due as cash.
          </p>
          {invoice && (
            <>
              <Row
                label="Invoice total"
                value={formatMoney(invoice.finalAmount)}
              />
              {invoiceBalance != null && (
                <p className="pt-1 text-sm">
                  Invoice balance:{" "}
                  <strong>{balanceLabel(invoiceBalance)}</strong>
                </p>
              )}
            </>
          )}
        </div>
      </article>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex justify-between ${strong ? "font-medium text-[var(--fh-steel)]" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
