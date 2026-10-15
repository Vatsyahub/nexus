"use client";

import { useEffect, useMemo, useState } from "react";
import {
  invoiceExtraTotal,
  invoiceOutstanding,
  invoiceRetentionHold,
  invoiceTdsHold,
  useFlowhubData,
} from "@/lib/store";
import { type Payment, type PaymentLink } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function balanceLabel(amount: number) {
  if (amount > 0.005) return `Due ${formatMoney(amount)}`;
  if (amount < -0.005) return `Extra ${formatMoney(-amount)}`;
  return "Paid";
}

export type PaymentFormValues = Omit<Payment, "id" | "createdAt">;

export function PaymentForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Payment;
  submitLabel: string;
  onSubmit: (values: PaymentFormValues) => Promise<string | null>;
}) {
  const data = useFlowhubData();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [contractId, setContractId] = useState(initial?.contractId ?? "");
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
  const [prefilledFor, setPrefilledFor] = useState<string | null>(
    initial?.invoiceId ?? null
  );

  const invoicesForLink = useMemo(() => {
    if (!contractId || link === "unlinked") return [];
    return data.invoices
      .filter((i) => i.contractId === contractId && i.type === link)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.invoices, contractId, link]);

  const selected = data.invoices.find((i) => i.id === invoiceId);

  useEffect(() => {
    if (link === "unlinked") {
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
    setPrefilledFor(selected.id);
  }, [selected, contractId, data, prefilledFor]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!contractId || !date) {
      setMsg("Select a contract and payment date.");
      return;
    }
    if (link !== "unlinked" && !invoiceId) {
      setMsg(link === "PI" ? "Select a proforma." : "Select a tax invoice.");
      return;
    }
    setPending(true);
    const err = await onSubmit({
      contractId,
      invoiceId: link === "unlinked" ? null : invoiceId,
      link,
      date,
      netAmount: Number(netAmount) || 0,
      gstAmount: Number(gstAmount) || 0,
      retentionAmount: Number(retention) || 0,
      tdsAmount: Number(tds) || 0,
      otherDeductions: Number(other) || 0,
      otherDeductionReason: otherReason.trim(),
    });
    setPending(false);
    if (err) setMsg(err);
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
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
          </select>
        </div>
        {link !== "unlinked" && (
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
                    {left != null ? ` · ${balanceLabel(left)}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
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
      </div>

      {msg && (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {msg}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="bg-[var(--fh-steel)] hover:bg-[#244a5e]"
      >
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
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
