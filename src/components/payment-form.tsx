"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format-money";
import {
  entryAccountedTowardInvoice,
  invoiceBalanceLabel,
  invoiceExtraTotal,
  invoiceOutstanding,
  invoiceRetentionHold,
  invoiceTdsHold,
  recoverablePoolViolation,
  recoverableRunningLineFigures,
  savedTaxInvoiceAccounted,
  taxInvoiceAccountedStatus,
  useFlowhubData,
} from "@/lib/store";
import { formatRecoverableRunningLine } from "@/lib/payment-display";
import { type Payment, type PaymentLink } from "@/lib/types";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export type PaymentFormValues = Omit<Payment, "id" | "createdAt">;

export function PaymentForm({
  initial,
  submitLabel,
  onSubmit,
  defaultContractId = "",
  contractSearch = false,
  cancelHref,
}: {
  initial?: Payment;
  submitLabel: string;
  onSubmit: (values: PaymentFormValues) => Promise<string | null>;
  defaultContractId?: string;
  /** Add payment uses type-to-search. Edit payment keeps the select. */
  contractSearch?: boolean;
  cancelHref?: string;
}) {
  const data = useFlowhubData();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [contractId, setContractId] = useState(
    initial?.contractId ?? defaultContractId
  );
  const typeaheadContracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const [link, setLink] = useState<PaymentLink>(initial?.link ?? "unlinked");
  const [invoiceId, setInvoiceId] = useState(initial?.invoiceId ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [netAmount, setNetAmount] = useState(
    initial ? String(initial.netAmount) : ""
  );
  const [gstAmount, setGstAmount] = useState(
    initial ? String(initial.gstAmount) : ""
  );
  const [retention, setRetention] = useState(
    initial ? String(initial.retentionAmount) : "0"
  );
  const [tds, setTds] = useState(initial ? String(initial.tdsAmount) : "0");
  const [other, setOther] = useState(
    initial ? String(initial.otherDeductions) : "0"
  );
  const [otherReason, setOtherReason] = useState(
    initial?.otherDeductionReason ?? ""
  );
  const [recovered, setRecovered] = useState(
    initial ? String(initial.recovered ?? 0) : "0"
  );
  const [prefilledFor, setPrefilledFor] = useState<string | null>(
    initial?.invoiceId ?? null
  );

  const contractHasRecoverable = useMemo(
    () =>
      !!contractId &&
      data.payments.some(
        (p) => p.contractId === contractId && p.link === "recoverable"
      ),
    [data.payments, contractId]
  );
  const showRecovered = link === "TI" && contractHasRecoverable;
  const poolFigures = recoverableRunningLineFigures(data.payments, contractId, {
    exceptPaymentId: initial?.id,
    thisEntry: showRecovered ? Number(recovered) || 0 : 0,
    openRecoverableCash:
      link === "recoverable"
        ? {
            paymentId: initial?.link === "recoverable" ? initial.id : null,
            net: Number(netAmount) || 0,
            gst: Number(gstAmount) || 0,
          }
        : null,
  });
  const poolLine = formatRecoverableRunningLine(
    poolFigures.recovered,
    poolFigures.pool
  );

  const invoicesForLink = useMemo(() => {
    if (!contractId || link === "unlinked" || link === "recoverable") return [];
    return data.invoices
      .filter((i) => i.contractId === contractId && i.type === link)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.invoices, contractId, link]);

  const selected = data.invoices.find((i) => i.id === invoiceId);
  const accountedBox =
    link === "TI" && selected && selected.type === "TI"
      ? {
          invoiceValue: selected.finalAmount,
          accounted:
            savedTaxInvoiceAccounted(
              data.payments,
              selected.id,
              initial?.id
            ) +
            entryAccountedTowardInvoice({
              netAmount: Number(netAmount) || 0,
              gstAmount: Number(gstAmount) || 0,
              retentionAmount: Number(retention) || 0,
              tdsAmount: Number(tds) || 0,
              otherDeductions: Number(other) || 0,
              recovered: Number(recovered) || 0,
              showRecovered,
            }),
        }
      : null;

  useEffect(() => {
    if (link === "unlinked" || link === "recoverable") {
      setInvoiceId("");
      return;
    }
    if (invoiceId && !invoicesForLink.some((i) => i.id === invoiceId)) {
      setInvoiceId("");
    }
  }, [link, invoicesForLink, invoiceId]);

  useEffect(() => {
    if (!selected || !contractId) return;
    if (prefilledFor === selected.id) return;
    const ret = invoiceRetentionHold(selected, data);
    const tdsHold = invoiceTdsHold(selected, data);
    const extra = invoiceExtraTotal(selected);
    // Cash portion only: invoice total − retention − TDS.
    // Retention and TDS are recorded separately and are not due as cash.
    setRetention(String(round2(ret)));
    setTds(String(round2(tdsHold)));
    setGstAmount(String(round2(selected.gstAmount)));
    setNetAmount(String(round2(selected.netAmount + extra - ret - tdsHold)));
    setOther("0");
    setOtherReason("");
    setRecovered("0");
    setPrefilledFor(selected.id);
  }, [selected, contractId, data, prefilledFor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!contractId || !date) {
      setMsg("Select a contract and payment date.");
      return;
    }
    const needsInvoice = link === "TI" || link === "PI";
    if (needsInvoice && !invoiceId) {
      setMsg(link === "PI" ? "Select a proforma." : "Select a tax invoice.");
      return;
    }
    const recoveredAmount = showRecovered ? Number(recovered) || 0 : 0;
    if (showRecovered && Number(recovered) < 0) {
      setMsg("Recovered cannot be more than what is left.");
      return;
    }
    const violation = recoverablePoolViolation(
      data.payments,
      {
        id: initial?.id,
        contractId,
        invoiceId: needsInvoice ? invoiceId : null,
        link,
        date,
        netAmount: Number(netAmount) || 0,
        gstAmount: Number(gstAmount) || 0,
        retentionAmount: Number(retention) || 0,
        tdsAmount: Number(tds) || 0,
        otherDeductions: Number(other) || 0,
        otherDeductionReason: otherReason.trim(),
        recovered: recoveredAmount,
      },
      initial?.contractId
    );
    if (violation) {
      setMsg(
        violation === "left" || link === "recoverable"
          ? "This cash leaves less than what is already recovered."
          : "Recovered cannot be more than what is left."
      );
      return;
    }
    setPending(true);
    const err = await onSubmit({
      contractId,
      invoiceId: needsInvoice ? invoiceId : null,
      link,
      date,
      netAmount: Number(netAmount) || 0,
      gstAmount: Number(gstAmount) || 0,
      retentionAmount: Number(retention) || 0,
      tdsAmount: Number(tds) || 0,
      otherDeductions: Number(other) || 0,
      otherDeductionReason: otherReason.trim(),
      recovered: recoveredAmount,
    });
    setPending(false);
    if (err) setMsg(err);
  }

  return (
    <form
      onSubmit={submit}
      {...entryRootProps}
      className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          {contractSearch ? (
            <ContractTypeahead
              contracts={typeaheadContracts}
              value={contractId}
              onChange={(id) => {
                if (id !== contractId) {
                  setInvoiceId("");
                  setPrefilledFor(null);
                }
                setContractId(id);
              }}
              placeholder="Type contract no. or name…"
            />
          ) : (
            <>
              <Label>Contract</Label>
              <select
                className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                value={contractId}
                onChange={(e) => {
                  setContractId(e.target.value);
                  setInvoiceId("");
                  setPrefilledFor(null);
                }}
                required
              >
                <option value="">Select…</option>
                {data.contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.projectNo} · {c.projectName}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="space-y-1">
          <Label>Link</Label>
          <select
            className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
            value={link}
            onChange={(e) => {
              setLink(e.target.value as PaymentLink);
              setPrefilledFor(null);
            }}
          >
            <option value="unlinked">Unlinked</option>
            <option value="TI">Tax invoice</option>
            <option value="PI">Proforma</option>
            <option value="recoverable">Recoverable</option>
          </select>
        </div>
        {(link === "TI" || link === "PI") && (
          <div className="space-y-1">
            <Label>{link === "PI" ? "Proforma" : "Tax invoice"}</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setPrefilledFor(null);
              }}
              required
              disabled={!contractId}
            >
              <option value="">Select…</option>
              {invoicesForLink.map((inv) => {
                const left =
                  inv.type === "TI" ? invoiceOutstanding(inv, data) : null;
                return (
                  <option key={inv.id} value={inv.id}>
                    {inv.number}
                    {left != null ? ` · ${invoiceBalanceLabel(left)}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        {accountedBox && (
          <TaxInvoiceAccountedBox
            invoiceValue={accountedBox.invoiceValue}
            accounted={accountedBox.accounted}
          />
        )}
        <div className="space-y-1">
          <Label>Payment date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <Field
          label="Cash — net"
          value={netAmount}
          onChange={setNetAmount}
        />
        <Field
          label="Cash — GST"
          value={gstAmount}
          onChange={setGstAmount}
        />
        <Field label="Retention (held)" value={retention} onChange={setRetention} />
        <Field label="TDS (held)" value={tds} onChange={setTds} />
        <Field label="Other deductions" value={other} onChange={setOther} />
        <div className="space-y-1">
          <Label>Deduction reason</Label>
          <Input
            type="text"
            value={otherReason}
            onChange={(e) => setOtherReason(e.target.value)}
            placeholder="Optional"
          />
        </div>
        {showRecovered && (
          <div className="space-y-1 sm:col-span-2">
            <Field label="Recovered" value={recovered} onChange={setRecovered} />
            <p className="text-xs text-[var(--fh-muted)]">{poolLine}</p>
          </div>
        )}
        {link === "recoverable" && contractId && (
          <p className="text-xs text-[var(--fh-muted)] sm:col-span-2">{poolLine}</p>
        )}
      </div>

      {msg && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {msg}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          {...entrySaveProps}
          disabled={pending}
          className="bg-[var(--fh-steel)] hover:bg-[#244a5e]"
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function TaxInvoiceAccountedBox({
  invoiceValue,
  accounted,
}: {
  invoiceValue: number;
  accounted: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] px-3 py-3 text-sm sm:col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[var(--fh-muted)]">Tax invoice value</span>
        <span className="tabular-nums font-medium">
          {formatMoney(invoiceValue)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[var(--fh-muted)]">Accounted towards invoice</span>
        <span className="tabular-nums font-medium">{formatMoney(accounted)}</span>
      </div>
      <p className="border-t border-[var(--fh-line)] pt-2 font-medium text-[var(--fh-steel)]">
        {taxInvoiceAccountedStatus(invoiceValue, accounted)}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
