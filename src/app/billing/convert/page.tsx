"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  convertPiToTi,
  flushWorkspace,
  isValidInvoiceQty,
  lineNet,
  useFlowhubData,
} from "@/lib/store";
import {
  GST_RATE,
  TERM_LABELS,
  orderedBillingTermKeys,
  type InvoiceExtraCharge,
  type InvoiceLine,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ConvertPiPage() {
  const router = useRouter();
  const data = useFlowhubData();
  const openPis = data.invoices.filter((i) => i.type === "PI");
  const [piId, setPiId] = useState("");
  const [tiNumber, setTiNumber] = useState("");
  const [tiDate, setTiDate] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  /** Raw qty text per line so "-" / "1." can be typed before it parses */
  const [qtyText, setQtyText] = useState<string[]>([]);
  const [charges, setCharges] = useState<InvoiceExtraCharge[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const pi = openPis.find((p) => p.id === piId);
  const contract = data.contracts.find((c) => c.id === pi?.contractId);

  useEffect(() => {
    if (!pi) {
      setLines([]);
      setQtyText([]);
      setCharges([]);
      return;
    }
    setLines(pi.lines.map((l) => ({ ...l })));
    setQtyText(pi.lines.map((l) => String(l.billedQty)));
    setCharges((pi.extraCharges ?? []).map((c) => ({ ...c })));
  }, [pi]);

  const net = lines.reduce((s, l) => s + l.lineNet, 0);
  const gst = contract?.gstApplicable ? net * GST_RATE : 0;
  const extraTotal = charges.reduce((s, c) => s + c.amount, 0);

  const termKeys = useMemo(() => {
    if (!contract) return [];
    return orderedBillingTermKeys(contract.billingTerms, { onlyPositive: true });
  }, [contract]);

  function recalcLine(line: InvoiceLine, patch: Partial<InvoiceLine>): InvoiceLine {
    const next = { ...line, ...patch };
    const termPercent =
      contract?.billingTerms[next.termKey] ?? next.termPercent;
    next.termPercent = termPercent;
    next.lineNet = lineNet(next.rate, next.billedQty, termPercent);
    return next;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!piId || !tiNumber.trim() || !tiDate) {
      setMsg("Pick a proforma and enter tax invoice number + date.");
      return;
    }
    if (
      lines.length === 0 ||
      lines.some((l) => !isValidInvoiceQty(l.billedQty))
    ) {
      setMsg("Keep at least one line; qty cannot be 0 (negative is allowed).");
      return;
    }
    const ti = convertPiToTi(piId, tiNumber, tiDate, {
      lines,
      extraCharges: charges,
    });
    if (!ti) {
      setMsg("Conversion failed.");
      return;
    }
    await flushWorkspace();
    router.push(`/billing/${ti.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Proforma → Tax Invoice
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/billing/new"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to new invoice
          </Link>
          <Link
            href="/billing"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Billing
          </Link>
        </div>
      </div>

      {msg && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {msg}
        </p>
      )}

      <form
        onSubmit={submit}
        className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-3">
            <Label>Open proforma</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={piId}
              onChange={(e) => setPiId(e.target.value)}
            >
              <option value="">Select…</option>
              {openPis.map((p) => {
                const c = data.contracts.find((x) => x.id === p.contractId);
                return (
                  <option key={p.id} value={p.id}>
                    {p.number} · {c?.projectNo} · {formatMoney(p.finalAmount)}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Tax invoice number</Label>
            <Input
              value={tiNumber}
              onChange={(e) => setTiNumber(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Tax invoice date</Label>
            <Input
              type="date"
              value={tiDate}
              onChange={(e) => setTiDate(e.target.value)}
            />
          </div>
        </div>

        {pi && contract && (
          <div className="space-y-3 border-t border-[var(--fh-line)] pt-4">
            <p className="text-sm font-medium">Line items (editable)</p>
            {lines.map((line, idx) => (
              <div
                key={`${line.boqItemId}-${line.termKey}-${idx}`}
                className="grid gap-2 sm:grid-cols-4"
              >
                <div className="sm:col-span-2 pt-6 text-sm font-medium">
                  {line.itemName}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Term</Label>
                  <select
                    className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                    value={line.termKey}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx
                            ? recalcLine(l, { termKey: e.target.value })
                            : l
                        )
                      )
                    }
                  >
                    {termKeys.map((k) => (
                      <option key={k} value={k}>
                        {TERM_LABELS[k] ?? k}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    Qty{" "}
                    <span className="text-[var(--fh-muted)]">
                      · {formatMoney(line.lineNet)}
                    </span>
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    value={qtyText[idx] ?? String(line.billedQty)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setQtyText((prev) => {
                        const next = [...prev];
                        next[idx] = raw;
                        return next;
                      });
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx
                            ? recalcLine(l, { billedQty: Number(raw) || 0 })
                            : l
                        )
                      );
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="space-y-2">
              <p className="text-sm font-medium">Extra charges</p>
              {charges.map((ch, idx) => (
                <div key={ch.id} className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={ch.label}
                    onChange={(e) =>
                      setCharges((prev) =>
                        prev.map((c, i) =>
                          i === idx ? { ...c, label: e.target.value } : c
                        )
                      )
                    }
                  />
                  <Input
                    type="number"
                    value={ch.amount}
                    onChange={(e) =>
                      setCharges((prev) =>
                        prev.map((c, i) =>
                          i === idx
                            ? { ...c, amount: Number(e.target.value) || 0 }
                            : c
                        )
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setCharges((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setCharges((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), label: "", amount: 0 },
                  ])
                }
              >
                + Charge
              </Button>
            </div>

            <p className="text-sm tabular-nums">
              Net {formatMoney(net)} + GST {formatMoney(gst)}
              {extraTotal ? ` + charges ${formatMoney(extraTotal)}` : ""} ={" "}
              <strong>{formatMoney(net + gst + extraTotal)}</strong>
            </p>
          </div>
        )}

        <Button
          type="submit"
          className="bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
        >
          Convert to tax invoice
        </Button>
      </form>
    </div>
  );
}
