import { billingTermLabel } from "@/lib/billing-terms";
import { formatMoney } from "@/lib/format-money";
import { itemNameKey } from "@/lib/item-rename";
import type {
  BoqAmendment,
  BoqAmendmentLineDiff,
  BoqItem,
  Contract,
  DeliveryChallan,
  InstallationProgress,
  Invoice,
  InvoiceLine,
  ScheduleLine,
} from "@/lib/types";

const QTY_EPS = 1e-6;
const RATE_EPS = 1e-6;

export type IdCarry = {
  fromId: string;
  toId: string;
};

/** One mismatch the tax-invoice screen can add as a callback line. */
export type BoqCallbackOffer = {
  itemName: string;
  /** BOQ id written on the tax invoice being reversed. */
  boqItemId: string;
  termKey: string;
  rate: number;
  termPercent: number;
  /** Negative quantity still billed above the current BOQ. */
  quantity: number;
};

type BilledBucket = {
  itemName: string;
  nameKey: string;
  termKey: string;
  rate: number;
  termPercent: number;
  boqItemId: string;
  net: number;
  stamp: string;
};

function sameRate(a: number, b: number): boolean {
  return Math.abs((Number(a) || 0) - (Number(b) || 0)) <= RATE_EPS;
}

function formatQty(n: number): string {
  const rounded = Math.round((Number(n) || 0) * 1000) / 1000;
  return String(rounded);
}

function resolveItemName(line: InvoiceLine, contract: Contract): string {
  const written = line.itemName?.trim();
  if (written) return written;
  const onBoq = contract.boq.find((row) => row.id === line.boqItemId);
  if (onBoq?.name.trim()) return onBoq.name.trim();
  for (const amendment of contract.amendments ?? []) {
    const snap = amendment.boqSnapshot.find((row) => row.id === line.boqItemId);
    if (snap?.name.trim()) return snap.name.trim();
    const diff = amendment.lineDiffs.find((row) => row.boqItemId === line.boqItemId);
    if (diff?.name.trim()) return diff.name.trim();
  }
  return "";
}

function lineStamp(invoice: Invoice): string {
  return `${invoice.date || ""}\0${invoice.createdAt || ""}`;
}

/**
 * Net tax-invoice quantity by item, term, and rate.
 * Proforma invoices are left out. `exceptInvoiceId` is the invoice being replaced.
 */
function billedBuckets(
  invoices: readonly Invoice[],
  contract: Contract,
  exceptInvoiceId?: string | null
): BilledBucket[] {
  const buckets: BilledBucket[] = [];
  for (const invoice of invoices) {
    if (invoice.type !== "TI" || invoice.contractId !== contract.id) continue;
    if (exceptInvoiceId && invoice.id === exceptInvoiceId) continue;
    const stamp = lineStamp(invoice);
    for (const line of invoice.lines ?? []) {
      const itemName = resolveItemName(line, contract);
      const termKey = line.termKey?.trim();
      if (!itemName || !termKey) continue;
      const qty = Number(line.billedQty) || 0;
      const rate = Number(line.rate) || 0;
      const nameKey = itemNameKey(itemName);
      let bucket = buckets.find(
        (row) =>
          row.nameKey === nameKey &&
          row.termKey === termKey &&
          sameRate(row.rate, rate)
      );
      if (!bucket) {
        bucket = {
          itemName,
          nameKey,
          termKey,
          rate,
          termPercent: Number(line.termPercent) || 0,
          boqItemId: line.boqItemId,
          net: 0,
          stamp,
        };
        buckets.push(bucket);
      }
      bucket.net += qty;
      if (stamp >= bucket.stamp) {
        bucket.stamp = stamp;
        bucket.itemName = itemName;
        bucket.termPercent = Number(line.termPercent) || 0;
        bucket.boqItemId = line.boqItemId;
        bucket.rate = rate;
      }
    }
  }
  return buckets;
}

function currentBoqLine(contract: Contract, name: string): BoqItem | undefined {
  const key = itemNameKey(name);
  return contract.boq.find((line) => itemNameKey(line.name) === key);
}

/**
 * Mismatch between tax invoices and the current BOQ.
 * Schedules are not included. A bucket already reversed to 0 is omitted.
 */
export function boqCallbackOffers(input: {
  contract: Contract;
  invoices: readonly Invoice[];
  exceptInvoiceId?: string | null;
}): BoqCallbackOffer[] {
  const offers: BoqCallbackOffer[] = [];
  for (const bucket of billedBuckets(
    input.invoices,
    input.contract,
    input.exceptInvoiceId
  )) {
    if (bucket.net <= QTY_EPS) continue;
    const current = currentBoqLine(input.contract, bucket.itemName);
    const rateChanged = !current || !sameRate(current.rate, bucket.rate);
    let quantity = 0;
    if (rateChanged || !current) {
      quantity = bucket.net;
    } else if (bucket.net > (Number(current.quantity) || 0) + QTY_EPS) {
      quantity = bucket.net - (Number(current.quantity) || 0);
    }
    if (quantity <= QTY_EPS) continue;
    offers.push({
      itemName: bucket.itemName,
      boqItemId: bucket.boqItemId,
      termKey: bucket.termKey,
      rate: bucket.rate,
      termPercent: bucket.termPercent,
      quantity: -quantity,
    });
  }
  offers.sort(
    (a, b) =>
      a.itemName.localeCompare(b.itemName) ||
      a.termKey.localeCompare(b.termKey) ||
      a.rate - b.rate
  );
  return offers;
}

export function draftCoversOffer(
  drafts: readonly { itemName: string; termKey: string; rate: number }[],
  offer: BoqCallbackOffer
): boolean {
  return drafts.some(
    (draft) =>
      itemNameKey(draft.itemName) === itemNameKey(offer.itemName) &&
      draft.termKey === offer.termKey &&
      sameRate(draft.rate, offer.rate)
  );
}

/**
 * Finished tax-invoice quantities, including callback lines on this invoice.
 * A term cannot go below 0, and cannot finish above the current BOQ quantity
 * (0 when the item is no longer on the BOQ). Proforma invoices are ignored.
 */
export function taxInvoiceQuantityIssues(input: {
  contract: Contract;
  invoices: readonly Invoice[];
  lines: readonly InvoiceLine[];
  exceptInvoiceId?: string | null;
}): string[] {
  const prior = new Map<string, number>();
  for (const bucket of billedBuckets(
    input.invoices,
    input.contract,
    input.exceptInvoiceId
  )) {
    const key = `${bucket.nameKey}\0${bucket.termKey}`;
    prior.set(key, (prior.get(key) ?? 0) + bucket.net);
  }
  const touched = new Map<string, { name: string; term: string; qty: number }>();
  for (const line of input.lines) {
    const name = resolveItemName(line, input.contract);
    const term = line.termKey?.trim();
    if (!name || !term) continue;
    const key = `${itemNameKey(name)}\0${term}`;
    const row = touched.get(key) ?? { name, term, qty: 0 };
    row.qty += Number(line.billedQty) || 0;
    touched.set(key, row);
  }
  const issues: string[] = [];
  for (const [key, row] of touched) {
    const result = (prior.get(key) ?? 0) + row.qty;
    const current = currentBoqLine(input.contract, row.name);
    const cap = current ? Number(current.quantity) || 0 : 0;
    const label = `${row.name}, ${billingTermLabel(row.term)}`;
    if (result < -QTY_EPS) {
      issues.push(`${label}: billed quantity cannot go below 0.`);
    } else if (result > cap + QTY_EPS) {
      issues.push(
        `${label}: billed quantity would be ${formatQty(result)}, above the BOQ quantity ${formatQty(cap)}.`
      );
    }
  }
  return issues;
}

/**
 * Any schedule on the contract blocks an amendment save or delete.
 * The message names the scheduled item when the schedule has one.
 */
function scheduleItemName(contract: Contract, boqItemId: string): string {
  const onBoq = contract.boq.find((row) => row.id === boqItemId);
  if (onBoq?.name.trim()) return onBoq.name.trim();
  for (const amendment of contract.amendments ?? []) {
    const snap = amendment.boqSnapshot.find((row) => row.id === boqItemId);
    if (snap?.name.trim()) return snap.name.trim();
    const diff = amendment.lineDiffs.find((row) => row.boqItemId === boqItemId);
    if (diff?.name.trim()) return diff.name.trim();
  }
  return "";
}

export function scheduleStopMessage(
  contract: Contract,
  schedules: readonly ScheduleLine[]
): string | null {
  const mine = schedules.filter((line) => line.contractId === contract.id);
  if (!mine.length) return null;
  const names = new Set<string>();
  for (const line of mine) {
    if (!line.boqItemId) continue;
    const name = scheduleItemName(contract, line.boqItemId);
    if (name) names.add(name);
  }
  const label = [...names].sort((a, b) => a.localeCompare(b)).join(", ");
  if (label) return `${label}: delete the schedule first.`;
  return "Delete the schedule first.";
}

export function existingLineRateIssues(
  previous: readonly BoqItem[],
  proposed: readonly BoqItem[]
): string[] {
  const issues: string[] = [];
  for (const line of proposed) {
    const original = previous.find((row) => row.id === line.id);
    if (!original) continue;
    if (sameRate(Number(original.rate) || 0, Number(line.rate) || 0)) continue;
    const name = line.name.trim() || original.name;
    issues.push(
      `${name}: an amendment cannot change the rate on an existing line. Remove the item and add it again at the new rate.`
    );
  }
  return issues;
}

function pairByName(
  removed: readonly { id: string; name: string }[],
  added: readonly { id: string; name: string }[],
  direction: "forward" | "back"
): IdCarry[] {
  const used = new Set<string>();
  const carries: IdCarry[] = [];
  for (const add of added) {
    const match = removed.find(
      (row) => !used.has(row.id) && itemNameKey(row.name) === itemNameKey(add.name)
    );
    if (!match) continue;
    used.add(match.id);
    carries.push(
      direction === "forward"
        ? { fromId: match.id, toId: add.id }
        : { fromId: add.id, toId: match.id }
    );
  }
  return carries;
}

/** Supplied and installed quantities move when a removed name is added again. */
export function rateChangeCarries(
  previous: readonly BoqItem[],
  next: readonly BoqItem[]
): IdCarry[] {
  const previousIds = new Set(previous.map((line) => line.id));
  const nextIds = new Set(next.map((line) => line.id));
  return pairByName(
    previous
      .filter((line) => !nextIds.has(line.id))
      .map((line) => ({ id: line.id, name: line.name })),
    next
      .filter((line) => !previousIds.has(line.id))
      .map((line) => ({ id: line.id, name: line.name })),
    "forward"
  );
}

export function undoRateChangeCarries(
  diffs: readonly BoqAmendmentLineDiff[]
): IdCarry[] {
  return pairByName(
    diffs
      .filter((diff) => diff.kind === "removed")
      .map((diff) => ({ id: diff.boqItemId, name: diff.name })),
    diffs
      .filter((diff) => diff.kind === "added")
      .map((diff) => ({ id: diff.boqItemId, name: diff.name })),
    "back"
  );
}

function undoBoq(
  base: readonly BoqItem[],
  diffs: readonly BoqAmendmentLineDiff[]
): BoqItem[] {
  const byId = new Map(diffs.map((diff) => [diff.boqItemId, diff]));
  const out: BoqItem[] = [];
  for (const line of base) {
    const diff = byId.get(line.id);
    if (diff?.kind === "added") continue;
    if (diff?.kind === "qty_changed" && diff.previousQty != null) {
      out.push({ ...line, quantity: diff.previousQty });
    } else {
      out.push({ ...line });
    }
  }
  for (const diff of diffs) {
    if (diff.kind !== "removed") continue;
    out.push({
      id: diff.boqItemId,
      catalogKey: itemNameKey(diff.name),
      name: diff.name,
      unit: diff.unit,
      rate: diff.rate,
      quantity: diff.previousQty ?? 0,
    });
  }
  return out;
}

/** BOQ and order value that were in force before this amendment. */
export function boqBeforeAmendment(
  contract: Contract,
  amendment: BoqAmendment
): BoqItem[] {
  const ordered = [...(contract.amendments ?? [])].sort((a, b) => a.seq - b.seq);
  const index = ordered.findIndex((row) => row.id === amendment.id);
  if (index > 0) {
    const previous = ordered[index - 1];
    if (previous?.boqSnapshot.length) {
      return previous.boqSnapshot.map((line) => ({ ...line }));
    }
  }
  const base = amendment.boqSnapshot.length ? amendment.boqSnapshot : contract.boq;
  return undoBoq(base, amendment.lineDiffs);
}

function namesById(
  contract: Contract,
  invoices: readonly Invoice[]
): Map<string, string> {
  const names = new Map<string, string>();
  const put = (id: string, name: string) => {
    const trimmed = name.trim();
    if (id && trimmed) names.set(id, trimmed);
  };
  for (const line of contract.boq) put(line.id, line.name);
  for (const amendment of contract.amendments ?? []) {
    for (const line of amendment.boqSnapshot) put(line.id, line.name);
    for (const diff of amendment.lineDiffs) put(diff.boqItemId, diff.name);
  }
  for (const invoice of invoices) {
    if (invoice.contractId !== contract.id) continue;
    for (const line of invoice.lines ?? []) put(line.boqItemId, line.itemName);
  }
  return names;
}

function olderQtyByName(older: readonly BoqItem[]): Map<string, number> {
  const qty = new Map<string, number>();
  for (const line of older) {
    const key = itemNameKey(line.name);
    qty.set(key, (qty.get(key) ?? 0) + (Number(line.quantity) || 0));
  }
  return qty;
}

function olderQtyAtRate(
  older: readonly BoqItem[],
  name: string,
  rate: number
): number {
  const key = itemNameKey(name);
  let qty = 0;
  for (const line of older) {
    if (itemNameKey(line.name) !== key || !sameRate(line.rate, rate)) continue;
    qty += Number(line.quantity) || 0;
  }
  return qty;
}

/**
 * Why the latest amendment cannot be deleted, or null when it can.
 * Schedule quantities are not part of the billed, supplied, or installed totals.
 */
export function amendmentDeleteError(input: {
  contract: Contract;
  invoices: readonly Invoice[];
  deliveryChallans: readonly DeliveryChallan[];
  installationProgress: readonly InstallationProgress[];
  schedules: readonly ScheduleLine[];
}): string | null {
  const amendments = [...(input.contract.amendments ?? [])].sort(
    (a, b) => a.seq - b.seq
  );
  const latest = amendments[amendments.length - 1];
  if (!latest) return "No amendment to delete.";
  const schedule = scheduleStopMessage(input.contract, input.schedules);
  if (schedule) return schedule;

  const older = boqBeforeAmendment(input.contract, latest);
  const buckets = billedBuckets(input.invoices, input.contract).sort(
    (a, b) =>
      a.itemName.localeCompare(b.itemName) ||
      a.termKey.localeCompare(b.termKey) ||
      a.rate - b.rate
  );
  for (const bucket of buckets) {
    if (bucket.net <= QTY_EPS) continue;
    const allowed = olderQtyAtRate(older, bucket.itemName, bucket.rate);
    if (bucket.net <= allowed + QTY_EPS) continue;
    return `${bucket.itemName}, ${billingTermLabel(bucket.termKey)} at ${formatMoney(bucket.rate)}: billed quantity ${formatQty(bucket.net)} belongs to this amendment (previous BOQ allows ${formatQty(allowed)}).`;
  }

  const names = namesById(input.contract, input.invoices);
  const supplied = new Map<string, number>();
  const installed = new Map<string, number>();
  const labelFor = new Map<string, string>();
  const addQty = (
    totals: Map<string, number>,
    id: string,
    qty: number
  ) => {
    const name = names.get(id) ?? id;
    const key = itemNameKey(name);
    if (!labelFor.has(key)) labelFor.set(key, name);
    totals.set(key, (totals.get(key) ?? 0) + (Number(qty) || 0));
  };
  for (const challan of input.deliveryChallans) {
    if (challan.contractId !== input.contract.id) continue;
    for (const line of challan.lines) addQty(supplied, line.boqItemId, line.qty);
  }
  for (const row of input.installationProgress) {
    if (row.contractId !== input.contract.id) continue;
    addQty(installed, row.boqItemId, row.installedQty);
  }
  const olderQty = olderQtyByName(older);
  const keys = [...new Set([...supplied.keys(), ...installed.keys()])].sort();
  for (const key of keys) {
    const allowed = olderQty.get(key) ?? 0;
    const name = labelFor.get(key) ?? key;
    const suppliedQty = supplied.get(key) ?? 0;
    if (suppliedQty > allowed + QTY_EPS) {
      return `${name}: supplied quantity ${formatQty(suppliedQty)} is above the previous BOQ quantity ${formatQty(allowed)}.`;
    }
    const installedQty = installed.get(key) ?? 0;
    if (installedQty > allowed + QTY_EPS) {
      return `${name}: installed quantity ${formatQty(installedQty)} is above the previous BOQ quantity ${formatQty(allowed)}.`;
    }
  }
  return null;
}

export function remapDeliveryChallans(
  challans: readonly DeliveryChallan[],
  contractId: string,
  carries: readonly IdCarry[]
): DeliveryChallan[] {
  if (!carries.length) return [...challans];
  const map = new Map(carries.map((carry) => [carry.fromId, carry.toId]));
  return challans.map((challan) => {
    if (challan.contractId !== contractId) return challan;
    let changed = false;
    const merged = new Map<string, number>();
    for (const line of challan.lines) {
      const nextId = map.get(line.boqItemId) ?? line.boqItemId;
      if (nextId !== line.boqItemId) changed = true;
      merged.set(nextId, (merged.get(nextId) ?? 0) + (Number(line.qty) || 0));
    }
    if (!changed) return challan;
    return {
      ...challan,
      lines: [...merged.entries()].map(([boqItemId, qty]) => ({
        boqItemId,
        qty,
      })),
    };
  });
}

export function remapInstallation(
  rows: readonly InstallationProgress[],
  contractId: string,
  carries: readonly IdCarry[]
): InstallationProgress[] {
  if (!carries.length) return [...rows];
  const map = new Map(carries.map((carry) => [carry.fromId, carry.toId]));
  const out: InstallationProgress[] = [];
  const indexById = new Map<string, number>();
  for (const row of rows) {
    if (row.contractId !== contractId) {
      out.push(row);
      continue;
    }
    const nextId = map.get(row.boqItemId) ?? row.boqItemId;
    const slot = indexById.get(nextId);
    if (slot == null) {
      indexById.set(nextId, out.length);
      out.push(nextId === row.boqItemId ? row : { ...row, boqItemId: nextId });
      continue;
    }
    const existing = out[slot];
    if (!existing) continue;
    const existingAt = existing.lastUpdatedAt ?? "";
    const rowAt = row.lastUpdatedAt ?? "";
    out[slot] = {
      ...existing,
      installedQty:
        (Number(existing.installedQty) || 0) + (Number(row.installedQty) || 0),
      history: [...(existing.history ?? []), ...(row.history ?? [])],
      lastUpdatedAt: existingAt >= rowAt ? existing.lastUpdatedAt : row.lastUpdatedAt,
    };
  }
  return out;
}
