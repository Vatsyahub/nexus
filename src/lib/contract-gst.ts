import { GST_RATE, type Invoice } from "@/lib/types";

/**
 * GST on a contract.
 * Older rows only have gstApplicable: true means 18%, false means not applicable.
 * Master can save a percent, including 0. A percent of 0 is stored.
 * Not applicable stays not applicable until that percent actually changes.
 *
 * Proformas live in the invoice list with type PI. A tax invoice is type TI.
 * Only a TI blocks a GST change. A PI does not.
 */

export const DEFAULT_GST_PERCENT = 18;

export const GST_PERCENT_RANGE_MESSAGE = "GST % must be zero or more.";

export const GST_INVOICE_LOCK_MESSAGE =
  "GST % cannot change after a tax invoice is raised on this contract.";

export type GstContract = {
  gstApplicable: boolean;
  gstPercent?: number | null;
};

export type GstFigure =
  | { kind: "percent"; percent: number }
  | { kind: "not-applicable" };

/** A saved percent, including 0. Missing or invalid stays unset. */
export function storedGstPercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

export function contractGstFigure(contract: GstContract): GstFigure {
  const explicit = storedGstPercent(contract.gstPercent);
  if (explicit != null) return { kind: "percent", percent: explicit };
  if (contract.gstApplicable) {
    return { kind: "percent", percent: DEFAULT_GST_PERCENT };
  }
  return { kind: "not-applicable" };
}

/** Decimal rate for a new invoice. Not applicable and 0% are 0. 18% stays 0.18. */
export function contractGstRate(contract: GstContract): number {
  const figure = contractGstFigure(contract);
  if (figure.kind === "not-applicable" || figure.percent === 0) return 0;
  if (figure.percent === DEFAULT_GST_PERCENT) return GST_RATE;
  return figure.percent / 100;
}

export function contractGstAmount(net: number, contract: GstContract): number {
  const figure = contractGstFigure(contract);
  const base = Number(net) || 0;
  if (figure.kind === "not-applicable" || figure.percent === 0) return 0;
  if (figure.percent === DEFAULT_GST_PERCENT) return base * GST_RATE;
  return (base * figure.percent) / 100;
}

/** Order value plus GST. 18% uses the existing rate. Another percent is that percent of the order. */
export function contractOrderWithGst(
  orderValue: number,
  contract: GstContract
): number {
  const figure = contractGstFigure(contract);
  const base = Number(orderValue) || 0;
  if (figure.kind === "not-applicable" || figure.percent === 0) return base;
  if (figure.percent === DEFAULT_GST_PERCENT) return base * (1 + GST_RATE);
  return base + contractGstAmount(base, contract);
}

export function contractChargesGst(contract: GstContract): boolean {
  return contractGstRate(contract) > 0;
}

/** Same card text the contract page already uses. The percent follows the contract. */
export function contractGstSummary(
  contract: GstContract & { orderValue: number },
  formatMoney: (amount: number) => string
): string {
  const figure = contractGstFigure(contract);
  if (figure.kind === "not-applicable") return "Not applicable";
  const withGst = contractOrderWithGst(contract.orderValue, contract);
  return `${formatGstPercent(figure.percent)}% · w/ GST ${formatMoney(withGst)}`;
}

export function formatGstPercent(percent: number): string {
  if (!Number.isFinite(percent)) return "0";
  const rounded = Math.round(percent * 1000) / 1000;
  return String(rounded);
}

/** Value in the GST % box. Not applicable opens as 0 and stays not applicable if saved as 0. */
export function gstEditValue(contract: GstContract): string {
  const figure = contractGstFigure(contract);
  if (figure.kind === "not-applicable") return "0";
  return formatGstPercent(figure.percent);
}

/** Blank counts as 0. Anything below 0, or not a number, is refused. */
export function acceptedGstPercent(value: string | number): number | null {
  if (typeof value === "string" && value.trim() === "") return 0;
  const percent = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(percent) || percent < 0) return null;
  return percent;
}

export function sameGstMeaning(a: GstContract, b: GstContract): boolean {
  return gstMeaningKey(a) === gstMeaningKey(b);
}

function gstMeaningKey(contract: GstContract): string {
  const figure = contractGstFigure(contract);
  if (figure.kind === "not-applicable") return "na";
  return `p:${formatGstPercent(figure.percent)}`;
}

/**
 * True when the typed percent is a different GST meaning.
 * 0 on a not-applicable contract is the same meaning.
 * 18 on an applicable contract that was never given its own percent is the same meaning.
 */
export function gstPercentChanged(
  contract: GstContract,
  nextPercent: number
): boolean {
  if (
    contractGstFigure(contract).kind === "not-applicable" &&
    nextPercent === 0
  ) {
    return false;
  }
  return !sameGstMeaning(contract, {
    gstApplicable: nextPercent > 0,
    gstPercent: nextPercent,
  });
}

/** Fields to store, or null when the typed percent does not change GST. */
export function gstFieldsForSave(
  contract: GstContract,
  nextPercent: number
): { gstApplicable: boolean; gstPercent: number } | null {
  if (!gstPercentChanged(contract, nextPercent)) return null;
  return {
    gstApplicable: nextPercent > 0,
    gstPercent: nextPercent,
  };
}

export function contractHasRaisedInvoice(
  invoices: readonly Pick<Invoice, "type" | "contractId">[],
  contractId: string
): boolean {
  return invoices.some(
    (invoice) => invoice.contractId === contractId && invoice.type === "TI"
  );
}

/** Screen message when a save would change GST after a tax invoice. Null when the save may proceed. */
export function gstSaveRefusal(
  contract: GstContract,
  invoices: readonly Pick<Invoice, "type" | "contractId">[],
  contractId: string,
  nextPercent: number
): string | null {
  if (!gstPercentChanged(contract, nextPercent)) return null;
  if (!contractHasRaisedInvoice(invoices, contractId)) return null;
  return GST_INVOICE_LOCK_MESSAGE;
}

export function withStoredGst<T extends GstContract>(
  incoming: T,
  stored: GstContract
): T {
  const next: T = { ...incoming, gstApplicable: stored.gstApplicable };
  const explicit = storedGstPercent(stored.gstPercent);
  if (explicit == null) delete next.gstPercent;
  else next.gstPercent = explicit;
  return next;
}

export function withoutExplicitGst<T extends GstContract>(contract: T): T {
  if (storedGstPercent(contract.gstPercent) == null) return contract;
  const next: T = { ...contract };
  delete next.gstPercent;
  return next;
}

/**
 * Master may change GST only while the contract has no tax invoice.
 * Every other role keeps the stored GST fields.
 * A new contract from anyone but Master does not carry a saved percent.
 */
export function retainContractGst<T extends GstContract & { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
  invoices: readonly Pick<Invoice, "type" | "contractId">[],
  master: boolean
): T[] {
  const stored = new Map(current.map((contract) => [contract.id, contract]));
  const raised = new Set(
    invoices
      .filter((invoice) => invoice.type === "TI")
      .map((invoice) => invoice.contractId)
  );
  return incoming.map((next) => {
    const prev = stored.get(next.id);
    if (!prev) return master ? next : withoutExplicitGst(next);
    if (!master) return withStoredGst(next, prev);
    if (raised.has(prev.id) && !sameGstMeaning(prev, next)) {
      return withStoredGst(next, prev);
    }
    return next;
  });
}
