"use client";

import { useState } from "react";
import { billingTermLabel } from "@/lib/billing-terms";
import type { BoqCallbackOffer } from "@/lib/amendment-callback";
import { formatMoney } from "@/lib/format-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CallbackDraftLine = {
  id: string;
  itemName: string;
  termKey: string;
  rate: number;
  termPercent: number;
  billedQty: string;
};

function formatOfferQty(quantity: number): string {
  const rounded = Math.round(quantity * 1000) / 1000;
  return rounded.toLocaleString("en-IN");
}

/** Lists tax-invoice mismatches and the callback lines already chosen. */
export function BoqCallbackPanel({
  offers,
  lines,
  onAdd,
  onQty,
  onRemove,
}: {
  offers: BoqCallbackOffer[];
  lines: CallbackDraftLine[];
  onAdd: (offers: BoqCallbackOffer[]) => void;
  onQty: (id: string, qty: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen((value) => !value)}
      >
        BOQ Callback
      </Button>
      {open && (
        <div className="space-y-2 rounded-lg border border-[var(--fh-line)] p-3">
          {offers.length === 0 ? (
            <p className="text-sm text-[var(--fh-muted)]">
              No mismatch between tax invoices and the current BOQ.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {offers.map((offer) => (
                  <li
                    key={`${offer.boqItemId}-${offer.termKey}-${offer.rate}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{offer.itemName}</span>
                      <span className="text-[var(--fh-muted)]">
                        {" "}
                        · {billingTermLabel(offer.termKey)} ·{" "}
                        {formatOfferQty(offer.quantity)} at {formatMoney(offer.rate)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onAdd([offer])}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
              {offers.length > 1 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onAdd(offers)}
                >
                  Add all
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {lines.length > 0 && (
        <ul className="space-y-2">
          {lines.map((line) => (
            <li
              key={line.id}
              className="rounded-lg border border-[var(--fh-line)] p-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {line.itemName}{" "}
                  <span className="font-normal text-[var(--fh-muted)]">
                    · {billingTermLabel(line.termKey)} · {formatMoney(line.rate)}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(line.id)}
                >
                  Remove
                </Button>
              </div>
              <div className="mt-2 max-w-xs space-y-1">
                <Label className="text-xs">
                  Billed qty{" "}
                  <span className="text-[var(--fh-muted)]">
                    ·{" "}
                    {formatMoney(
                      (line.rate * (Number(line.billedQty) || 0) * line.termPercent) /
                        100
                    )}
                  </span>
                </Label>
                <Input
                  type="number"
                  step="any"
                  value={line.billedQty}
                  onChange={(event) => onQty(line.id, event.target.value)}
                  aria-label={`Callback qty for ${line.itemName} ${billingTermLabel(line.termKey)}`}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
