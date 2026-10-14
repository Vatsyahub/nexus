"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  flushWorkspace,
  isValidInvoiceQty,
  lineNet,
  updateInvoice,
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

type DraftLine = {
  id: string;
  boqItemId: string;
  termKey: string;
  billedQty: string;
};

export default function EditInvoicePage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const data = useFlowhubData();
  const inv = data.invoices.find((i) => i.id === id);
  const contract = data.contracts.find((c) => c.id === inv?.contractId);

  const [msg, setMsg] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [charges, setCharges] = useState<
    { id: string; label: string; amount: string }[]
  >([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!inv || hydrated) return;
    setNumber(inv.number);
    setDate(inv.date);
    setDraftLines(
      inv.lines.map((l) => ({
        id: crypto.randomUUID(),
        boqItemId: l.boqItemId,
        termKey: l.termKey,
        billedQty: String(l.billedQty),
      }))
    );
    setCharges(
      (inv.extraCharges ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        amount: String(c.amount),
      }))
    );
    setHydrated(true);
  }, [inv, hydrated]);

  const termKeys = useMemo(() => {
    if (!contract) return [];
    return orderedBillingTermKeys(contract.billingTerms, { onlyPositive: true });
  }, [contract]);

  const previewLines: InvoiceLine[] = useMemo(() => {
    if (!contract) return [];
    return draftLines
      .map((d) => {
        const item = contract.boq.find((b) => b.id === d.boqItemId);
        if (!item || !d.termKey) return null;
        const qty = Number(d.billedQty) || 0;
        const termPercent = contract.billingTerms[d.termKey] || 0;
        return {
          boqItemId: item.id,
          itemName: item.name,
          termKey: d.termKey,
          billedQty: qty,
          rate: item.rate,
          termPercent,
          lineNet: lineNet(item.rate, qty, termPercent),
        } satisfies InvoiceLine;
      })
      .filter(Boolean) as InvoiceLine[];
  }, [contract, draftLines]);

  function draftLineNet(d: DraftLine): number {
    const item = contract?.boq.find((b) => b.id === d.boqItemId);
    if (!item || !contract) return 0;
    return lineNet(
      item.rate,
      Number(d.billedQty) || 0,
      contract.billingTerms[d.termKey] || 0
    );
  }

  const net = previewLines.reduce((s, l) => s + l.lineNet, 0);
  const gst = contract?.gstApplicable ? net * GST_RATE : 0;
  const extraTotal = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  function addLineForItem(boqItemId: string) {
    const defaultTerm = termKeys[0] || "supply";
    setDraftLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        boqItemId,
        termKey: defaultTerm,
        billedQty: "1",
      },
    ]);
  }

  async function saveInvoice(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!number.trim() || !date) {
      setMsg("Fill number and date.");
      return;
    }
    if (
      previewLines.length === 0 ||
      previewLines.some((l) => !isValidInvoiceQty(l.billedQty))
    ) {
      setMsg("Add at least one line; billed qty cannot be 0 (negative is allowed).");
      return;
    }
    const extraCharges: InvoiceExtraCharge[] = charges
      .filter((c) => c.label.trim() && Number(c.amount) > 0)
      .map((c) => ({
        id: c.id,
        label: c.label.trim(),
        amount: Number(c.amount),
      }));
    const updated = updateInvoice(id, {
      number,
      date,
      lines: previewLines,
      extraCharges,
    });
    if (!updated) {
      setMsg("Could not save invoice.");
      return;
    }
    await flushWorkspace();
    router.push(`/billing/${id}`);
  }

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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Edit {inv.type}
          </h1>
          <p className="mt-1 text-sm text-[var(--fh-muted)]">
            {contract.projectNo} · {inv.number}
          </p>
        </div>
        <Link
          href={`/billing/${id}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
      </div>

      {msg && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {msg}
        </p>
      )}

      <form
        onSubmit={saveInvoice}
        className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Type</Label>
            <Input value={inv.type} disabled />
          </div>
          <div className="space-y-1">
            <Label>Contract</Label>
            <Input
              value={`${contract.projectNo} — ${contract.projectName}`}
              disabled
            />
          </div>
          <div className="space-y-1">
            <Label>Invoice number</Label>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Invoice date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-4 border-t border-[var(--fh-line)] pt-4">
          <p className="text-sm font-medium">BOQ — add term lines per item</p>
          <ul className="space-y-3">
            {contract.boq.map((item) => {
              const lines = draftLines.filter((d) => d.boqItemId === item.id);
              return (
                <li
                  key={item.id}
                  className="rounded-lg border border-[var(--fh-line)] p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {item.name}{" "}
                      <span className="text-[var(--fh-muted)]">
                        ({item.quantity} {item.unit} @ {formatMoney(item.rate)})
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => addLineForItem(item.id)}
                    >
                      + Term line
                    </Button>
                  </div>
                  {lines.map((draft) => (
                    <div key={draft.id} className="mt-2 grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Billing term</Label>
                        <select
                          className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
                          value={draft.termKey}
                          onChange={(e) =>
                            setDraftLines((prev) =>
                              prev.map((p) =>
                                p.id === draft.id
                                  ? { ...p, termKey: e.target.value }
                                  : p
                              )
                            )
                          }
                        >
                          {termKeys.map((k) => (
                            <option key={k} value={k}>
                              {TERM_LABELS[k] ?? k} ({contract.billingTerms[k]}%)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Billed qty{" "}
                          <span className="text-[var(--fh-muted)]">
                            · {formatMoney(draftLineNet(draft))}
                          </span>
                        </Label>
                        <Input
                          type="number"
                          step="any"
                          value={draft.billedQty}
                          onChange={(e) =>
                            setDraftLines((prev) =>
                              prev.map((p) =>
                                p.id === draft.id
                                  ? { ...p, billedQty: e.target.value }
                                  : p
                              )
                            )
                          }
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setDraftLines((prev) =>
                              prev.filter((p) => p.id !== draft.id)
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>

          <div className="space-y-2 border-t border-[var(--fh-line)] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                Additional charges (after GST, no GST)
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setCharges((prev) => [
                    ...prev,
                    { id: crypto.randomUUID(), label: "", amount: "" },
                  ])
                }
              >
                + Charge
              </Button>
            </div>
            {charges.map((ch) => (
              <div key={ch.id} className="grid gap-2 sm:grid-cols-3">
                <Input
                  placeholder="Label"
                  value={ch.label}
                  onChange={(e) =>
                    setCharges((prev) =>
                      prev.map((p) =>
                        p.id === ch.id ? { ...p, label: e.target.value } : p
                      )
                    )
                  }
                />
                <Input
                  type="number"
                  placeholder="Amount"
                  value={ch.amount}
                  onChange={(e) =>
                    setCharges((prev) =>
                      prev.map((p) =>
                        p.id === ch.id ? { ...p, amount: e.target.value } : p
                      )
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setCharges((prev) => prev.filter((p) => p.id !== ch.id))
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <p className="text-sm tabular-nums">
            Net {formatMoney(net)}
            {contract.gstApplicable ? ` + GST ${formatMoney(gst)}` : ""}
            {extraTotal > 0 ? ` + charges ${formatMoney(extraTotal)}` : ""} ={" "}
            <strong>{formatMoney(net + gst + extraTotal)}</strong>
          </p>
        </div>

        <Button type="submit" className="bg-[var(--fh-steel)]">
          Save changes
        </Button>
      </form>
    </div>
  );
}
