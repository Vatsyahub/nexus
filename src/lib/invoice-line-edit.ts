import { lineNet } from "@/lib/store";
import {
  orderedBillingTermKeys,
  type BillingTerms,
  type BoqItem,
  type InvoiceLine,
} from "@/lib/types";

/** Rate and term percent saved on an invoice line. */
export type StoredLineFigures = {
  rate: number;
  termPercent: number;
  itemName: string;
};

export type InvoiceEditDraft = {
  boqItemId: string;
  termKey: string;
  billedQty: number;
  /** Set when the line was loaded from an invoice. A new line omits it. */
  stored?: StoredLineFigures;
};

function finiteNumber(value: number, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * One edit-screen line.
 * A stored line keeps its rate and term percent. Quantity is the edited quantity.
 * A new line uses today's BOQ rate and today's contract percent for its term.
 */
export function previewInvoiceLine(
  draft: InvoiceEditDraft,
  boq: readonly BoqItem[],
  billingTerms: BillingTerms
): InvoiceLine | null {
  const item = boq.find((row) => row.id === draft.boqItemId);
  if (!item || !draft.termKey) return null;
  const billedQty = finiteNumber(draft.billedQty, 0);
  const rate = draft.stored
    ? finiteNumber(draft.stored.rate, 0)
    : finiteNumber(item.rate, 0);
  const termPercent = draft.stored
    ? finiteNumber(draft.stored.termPercent, 0)
    : finiteNumber(billingTerms[draft.termKey], 0);
  const itemName = draft.stored?.itemName?.trim()
    ? draft.stored.itemName
    : item.name;
  return {
    boqItemId: item.id,
    itemName,
    termKey: draft.termKey,
    billedQty,
    rate,
    termPercent,
    lineNet: lineNet(rate, billedQty, termPercent),
  };
}

export function previewInvoiceLines(
  drafts: readonly InvoiceEditDraft[],
  boq: readonly BoqItem[],
  billingTerms: BillingTerms
): InvoiceLine[] {
  const lines: InvoiceLine[] = [];
  for (const draft of drafts) {
    const line = previewInvoiceLine(draft, boq, billingTerms);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Terms offered while editing a line. The line's own term stays in the list
 * when today's percent for that term is zero.
 */
export function billingTermChoices(
  terms: BillingTerms,
  currentTermKey: string
): string[] {
  const keys = orderedBillingTermKeys(terms, { onlyPositive: true });
  if (!currentTermKey || keys.includes(currentTermKey)) return keys;
  return [currentTermKey, ...keys];
}

/**
 * A quantity or term edit on a proforma line.
 * The rate and the percent stored on that line stay. Line net is recalculated
 * from those stored figures and the edited quantity.
 */
export function recalcTouchedInvoiceLine(
  line: InvoiceLine,
  patch: Partial<InvoiceLine>
): InvoiceLine {
  const rawQty = patch.billedQty === undefined ? line.billedQty : patch.billedQty;
  const billedQty = finiteNumber(rawQty, 0);
  const termKey = patch.termKey ? patch.termKey : line.termKey;
  const rate = finiteNumber(line.rate, 0);
  const termPercent = finiteNumber(line.termPercent, 0);
  return {
    ...line,
    ...patch,
    boqItemId: line.boqItemId,
    itemName: line.itemName,
    termKey,
    billedQty,
    rate,
    termPercent,
    lineNet: lineNet(rate, billedQty, termPercent),
  };
}
