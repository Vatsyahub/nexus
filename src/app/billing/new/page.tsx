"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addInvoice,
  flushWorkspace,
  isValidInvoiceQty,
  useFlowhubData,
} from "@/lib/store";
import { billingTermLabel } from "@/lib/billing-terms";
import {
  boqCallbackOffers,
  draftCoversOffer,
  taxInvoiceQuantityIssues,
  type BoqCallbackOffer,
} from "@/lib/amendment-callback";
import {
  previewInvoiceLine,
  type StoredLineFigures,
} from "@/lib/invoice-line-edit";
import {
  GST_RATE,
  orderedBillingTermKeys,
  type InvoiceExtraCharge,
  type InvoiceLine,
} from "@/lib/types";
import { BoqCallbackPanel } from "@/components/boq-callback-panel";
import { ADD_CONTRACT_MATCH_LIMIT } from "@/lib/add-contract-matches";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
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
  stored?: StoredLineFigures;
};

export default function NewInvoicePage() {
  const router = useRouter();
  const data = useFlowhubData();
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<"PI" | "TI">("PI");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState("");
  const [contractId, setContractId] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [charges, setCharges] = useState<
    { id: string; label: string; amount: string }[]
  >([]);

  const contracts = useMemo(
    () =>
      [...data.contracts].sort((a, b) =>
        a.projectNo.localeCompare(b.projectNo)
      ),
    [data.contracts]
  );
  const contract = contracts.find((c) => c.id === contractId);
  const termKeys = useMemo(() => {
    if (!contract) return [];
    return orderedBillingTermKeys(contract.billingTerms, { onlyPositive: true });
  }, [contract]);

  const previewLines: InvoiceLine[] = useMemo(() => {
    if (!contract) return [];
    return draftLines
      .map((d) =>
        previewInvoiceLine(
          {
            boqItemId: d.boqItemId,
            termKey: d.termKey,
            billedQty: Number(d.billedQty) || 0,
            stored: d.stored,
          },
          contract.boq,
          contract.billingTerms
        )
      )
      .filter((line): line is InvoiceLine => line != null);
  }, [contract, draftLines]);

  const callbackOffers = useMemo(() => {
    if (!contract || type !== "TI") return [];
    const offers = boqCallbackOffers({
      contract,
      invoices: data.invoices,
    });
    return offers.filter(
      (offer) =>
        !draftLines.some((draft) => {
          const item = contract.boq.find((row) => row.id === draft.boqItemId);
          return draftCoversOffer(
            [
              {
                itemName: draft.stored?.itemName || item?.name || "",
                termKey: draft.termKey,
                rate: draft.stored?.rate ?? item?.rate ?? 0,
              },
            ],
            offer
          );
        })
    );
  }, [contract, data.invoices, draftLines, type]);

  const callbackLines = draftLines.filter(
    (draft) =>
      draft.stored && !contract?.boq.some((row) => row.id === draft.boqItemId)
  );

  function draftPreview(d: DraftLine): InvoiceLine | null {
    if (!contract) return null;
    return previewInvoiceLine(
      {
        boqItemId: d.boqItemId,
        termKey: d.termKey,
        billedQty: Number(d.billedQty) || 0,
        stored: d.stored,
      },
      contract.boq,
      contract.billingTerms
    );
  }

  const net = previewLines.reduce((s, l) => s + l.lineNet, 0);
  const gst = contract?.gstApplicable ? net * GST_RATE : 0;
  const extraTotal = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);

  function addCallbackLines(offers: BoqCallbackOffer[]) {
    setDraftLines((prev) => [
      ...prev,
      ...offers.map((offer) => ({
        id: crypto.randomUUID(),
        boqItemId: offer.boqItemId,
        termKey: offer.termKey,
        billedQty: String(offer.quantity),
        stored: {
          rate: offer.rate,
          termPercent: offer.termPercent,
          itemName: offer.itemName,
        },
      })),
    ]);
  }

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
    if (!contractId || !number.trim() || !date) {
      setMsg("Fill type, number, date, and contract.");
      return;
    }
    if (
      previewLines.length === 0 ||
      previewLines.some((l) => !isValidInvoiceQty(l.billedQty))
    ) {
      setMsg("Add at least one line; billed qty cannot be 0 (negative is allowed).");
      return;
    }
    if (type === "TI" && contract) {
      const qtyIssues = taxInvoiceQuantityIssues({
        contract,
        invoices: data.invoices,
        lines: previewLines,
      });
      if (qtyIssues.length) {
        setMsg(qtyIssues[0]);
        return;
      }
    }
    const extraCharges: InvoiceExtraCharge[] = charges
      .filter((c) => c.label.trim() && Number(c.amount) > 0)
      .map((c) => ({
        id: c.id,
        label: c.label.trim(),
        amount: Number(c.amount),
      }));
    const inv = addInvoice({
      type,
      number,
      date,
      contractId,
      lines: previewLines,
      extraCharges,
    });
    if (!inv) {
      setMsg("Could not save invoice.");
      return;
    }
    await flushWorkspace();
    router.push(`/billing/${inv.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Add Invoice
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/billing/convert"
            className={cn(
              buttonVariants(),
              "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
            )}
          >
            One-click PI → TI
          </Link>
          <Link
            href="/billing"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to billing
          </Link>
        </div>
      </div>

      {msg && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {msg}
        </p>
      )}

      <form
        onSubmit={saveInvoice}
        {...entryRootProps}
        className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Type</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={type}
              onChange={(e) => {
                const next = e.target.value as "PI" | "TI";
                setType(next);
                if (next === "PI") {
                  setDraftLines((prev) => prev.filter((draft) => !draft.stored));
                }
              }}
            >
              <option value="PI">Proforma Invoice</option>
              <option value="TI">Tax Invoice</option>
            </select>
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
          <ContractTypeahead
            contracts={contracts}
            value={contractId}
            onChange={(id) => {
              if (id !== contractId) setDraftLines([]);
              setContractId(id);
            }}
            placeholder="Type project number or name…"
            maxMatches={ADD_CONTRACT_MATCH_LIMIT}
          />
        </div>

        {contract && (
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
                      <div
                        key={draft.id}
                        className="mt-2 grid gap-2 sm:grid-cols-3"
                      >
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
                                {billingTermLabel(k)} ({contract.billingTerms[k]}
                                %)
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            Billed qty{" "}
                            <span className="text-[var(--fh-muted)]">
                              · {formatMoney(draftPreview(draft)?.lineNet ?? 0)}
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

            {type === "TI" && contract && (
              <BoqCallbackPanel
                offers={callbackOffers}
                lines={callbackLines.map((draft) => ({
                  id: draft.id,
                  itemName: draft.stored?.itemName || "Item",
                  termKey: draft.termKey,
                  rate: draft.stored?.rate ?? 0,
                  termPercent: draft.stored?.termPercent ?? 0,
                  billedQty: draft.billedQty,
                }))}
                onAdd={addCallbackLines}
                onQty={(id, qty) =>
                  setDraftLines((prev) =>
                    prev.map((row) =>
                      row.id === id ? { ...row, billedQty: qty } : row
                    )
                  )
                }
                onRemove={(id) =>
                  setDraftLines((prev) => prev.filter((row) => row.id !== id))
                }
              />
            )}

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
        )}

        <Button
          type="submit"
          {...entrySaveProps}
          className="bg-[var(--fh-steel)]"
          disabled={!contract}
        >
          Save {type === "PI" ? "proforma" : "tax invoice"}
        </Button>
      </form>
    </div>
  );
}
