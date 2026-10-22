/**
 * Report builders for Nexus (REPORTS.md).
 * Money rules stay TI-driven — same helpers as billing/payments.
 *
 * Locked money rules (reports):
 * - Expected payment / expected held = theoretical (ret%×net, tds%×net).
 * - Retention held / TDS held columns = actual sums from payment entries.
 * - Unlinked ret/TDS count in contract-level actual held; TI rows show linked only.
 * - Outstanding with a linked payment = invoice final − (cash net+GST + deduction
 *   + retention held + TDS held + recovered). Within half a paisa, that is 0.
 *   Extra is only the excess above the final. No linked payment: expected cash
 *   minus FIFO unlinked net+GST+deduction. Recoverable-link cash does not count.
 * - Sales “Total outstanding net” = Σ (TI net − ret%×net − tds%×net − net received).
 *   Net received is linked payment netAmount plus FIFO of unlinked netAmount only.
 *   GST, extras, other deductions, retention cash, and TDS cash stay out.
 *   If recovered alone would make that net figure negative while the full
 *   accounted sum equals the invoice final, the net figure is 0.
 */

import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";
import { matchesAny } from "@/lib/list-search";
import { handoverDateForContract } from "@/lib/nexus-core";
import {
  dateSearchForms,
  formatDisplayDate,
  isDateInInclusiveRange,
} from "@/lib/dates";
import { formatMoney } from "@/lib/format-money";
import {
  contractActualRetentionHold,
  contractActualTdsHold,
  invoiceActualRetentionHold,
  invoiceActualTdsHold,
  invoiceDueDate,
  invoiceExpectedCash,
  invoiceExtraTotal,
  invoiceOutstanding,
  invoiceRetentionHold,
  invoiceTdsHold,
  outstandingIsStillDue,
  paymentAccounted,
  paymentReceivedTotal,
  paymentRecovered,
} from "@/lib/store";

function isTiLinkedPayment(p: Payment) {
  return p.link === "TI" || (!p.link && !!p.invoiceId);
}

/** Linked-payment component sums for a TI (unlinked FIFO is not attributed here). */
function tiLinkedPaidBreakdown(ti: Invoice, data: FlowhubData) {
  let netPaid = 0;
  let gstPaid = 0;
  let otherPaid = 0;
  for (const p of data.payments) {
    if (p.invoiceId !== ti.id || !isTiLinkedPayment(p)) continue;
    netPaid += Number(p.netAmount) || 0;
    gstPaid += Number(p.gstAmount) || 0;
    otherPaid += Number(p.otherDeductions) || 0;
  }
  return { netPaid, gstPaid, otherPaid };
}

/** Client/customer name is specified in ideation but not yet on Contract. */
export function contractClientLabel(_contract: Contract): string {
  return "—";
}

export type ReconciliationTiRow = {
  invoiceId: string;
  number: string;
  date: string;
  net: number;
  gst: number;
  extras: number;
  finalAmount: number;
  /** Theoretical ret% × net */
  retentionExpected: number;
  /** Theoretical tds% × net */
  tdsExpected: number;
  expected: number;
  /** Sum netAmount on payments linked to this TI */
  netPaid: number;
  /** Sum gstAmount on payments linked to this TI */
  gstPaid: number;
  /** Sum retentionAmount on payments linked to this TI */
  retentionActual: number;
  /** Sum tdsAmount on payments linked to this TI */
  tdsActual: number;
  /** Sum otherDeductions on payments linked to this TI */
  otherPaid: number;
  outstanding: number;
};

export type ReconciliationPaymentRow = {
  paymentId: string;
  againstLabel: string;
  invoiceId: string | null;
  date: string;
  net: number;
  gst: number;
  retention: number;
  tds: number;
  other: number;
  paidTotal: number;
  link: Payment["link"];
};

export type ReconciliationTotals = {
  invoiced: number;
  retentionExpected: number;
  retentionActual: number;
  tdsExpected: number;
  tdsActual: number;
  expected: number;
  /** Σ(net + GST + other + recovered) toward outstanding, incl. FIFO-allocated unlinked */
  paid: number;
  outstanding: number;
};

export type ReconciliationDetail = {
  contract: Contract;
  client: string;
  tis: ReconciliationTiRow[];
  payments: ReconciliationPaymentRow[];
  totals: ReconciliationTotals;
};

export type ReconciliationSummaryRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  city: string;
  invoiced: number;
  /** Actual retention held from payment entries (contract-level, incl. unlinked) */
  retentionActual: number;
  /** Actual TDS held from payment entries (contract-level, incl. unlinked) */
  tdsActual: number;
  /** Σ(net + GST + other + recovered) toward outstanding */
  paid: number;
  expected: number;
  outstanding: number;
};

function contractTis(contractId: string, data: FlowhubData): Invoice[] {
  return data.invoices
    .filter((i) => i.type === "TI" && i.contractId === contractId)
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    );
}

function tiNumberMap(tis: Invoice[]): Map<string, string> {
  return new Map(tis.map((t) => [t.id, t.number]));
}

/** Payments that affect TI reconciliation for a contract (TI-linked + unlinked). */
function reconciliationPayments(
  contractId: string,
  data: FlowhubData,
  numbers: Map<string, string>
): ReconciliationPaymentRow[] {
  return data.payments
    .filter((p) => {
      if (p.contractId !== contractId) return false;
      if (p.link === "PI") return false;
      return p.link === "TI" || p.link === "unlinked" || !p.link;
    })
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
    )
    .map((p) => {
      const againstLabel =
        p.link === "unlinked" || !p.invoiceId
          ? "Unlinked"
          : numbers.get(p.invoiceId) ?? "TI";
      return {
        paymentId: p.id,
        againstLabel,
        invoiceId: p.invoiceId,
        date: p.date,
        net: Number(p.netAmount) || 0,
        gst: Number(p.gstAmount) || 0,
        retention: Number(p.retentionAmount) || 0,
        tds: Number(p.tdsAmount) || 0,
        other: Number(p.otherDeductions) || 0,
        paidTotal: paymentAccounted(p),
        link: p.link,
      };
    });
}

function tiRow(ti: Invoice, data: FlowhubData): ReconciliationTiRow {
  const { netPaid, gstPaid, otherPaid } = tiLinkedPaidBreakdown(ti, data);
  return {
    invoiceId: ti.id,
    number: ti.number,
    date: ti.date,
    net: ti.netAmount,
    gst: ti.gstAmount,
    extras: invoiceExtraTotal(ti),
    finalAmount: ti.finalAmount,
    retentionExpected: invoiceRetentionHold(ti, data),
    tdsExpected: invoiceTdsHold(ti, data),
    expected: invoiceExpectedCash(ti, data),
    netPaid,
    gstPaid,
    retentionActual: invoiceActualRetentionHold(ti, data),
    tdsActual: invoiceActualTdsHold(ti, data),
    otherPaid,
    outstanding: invoiceOutstanding(ti, data),
  };
}

function totalsForContract(
  contractId: string,
  tis: Invoice[],
  data: FlowhubData
): ReconciliationTotals {
  let invoiced = 0;
  let retentionExpected = 0;
  let tdsExpected = 0;
  let expected = 0;
  let paid = 0;
  let outstanding = 0;
  for (const ti of tis) {
    invoiced += ti.finalAmount;
    retentionExpected += invoiceRetentionHold(ti, data);
    tdsExpected += invoiceTdsHold(ti, data);
    expected += invoiceExpectedCash(ti, data);
    paid += paymentReceivedTotal(ti.id, data);
    outstanding += invoiceOutstanding(ti, data);
  }
  // Contract-level actual held includes unlinked payment ret/TDS in full.
  const retentionActual = contractActualRetentionHold(contractId, data);
  const tdsActual = contractActualTdsHold(contractId, data);
  return {
    invoiced,
    retentionExpected,
    retentionActual,
    tdsExpected,
    tdsActual,
    expected,
    paid,
    outstanding,
  };
}

export function buildReconciliationDetail(
  contractId: string,
  data: FlowhubData
): ReconciliationDetail | null {
  const contract = data.contracts.find((c) => c.id === contractId);
  if (!contract) return null;

  const tis = contractTis(contractId, data);
  const numbers = tiNumberMap(tis);

  return {
    contract,
    client: contractClientLabel(contract),
    tis: tis.map((ti) => tiRow(ti, data)),
    payments: reconciliationPayments(contractId, data, numbers),
    totals: totalsForContract(contractId, tis, data),
  };
}

export function buildReconciliationSummary(
  data: FlowhubData,
  opts?: { city?: string; q?: string }
): ReconciliationSummaryRow[] {
  const city = (opts?.city ?? "").trim().toLowerCase();
  const q = opts?.q ?? "";

  return data.contracts
    .slice()
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo))
    .filter((c) => {
      if (city && c.city.toLowerCase() !== city) return false;
      return matchesAny(q, [
        c.projectNo,
        c.projectName,
        c.city,
        c.state,
        contractClientLabel(c),
      ]);
    })
    .map((c) => {
      const tis = contractTis(c.id, data);
      const totals = totalsForContract(c.id, tis, data);
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city,
        invoiced: totals.invoiced,
        retentionActual: totals.retentionActual,
        tdsActual: totals.tdsActual,
        paid: totals.paid,
        expected: totals.expected,
        outstanding: totals.outstanding,
      };
    });
}

export type InvoiceOutstandingStatus =
  | "paid"
  | "partially paid"
  | "due"
  | "overdue";

export type InvoiceOutstandingRow = {
  invoiceId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  city: string;
  number: string;
  date: string;
  dueDate: string;
  /** TI final amount */
  finalAmount: number;
  expected: number;
  /** net + GST + other + recovered toward outstanding (0 if none) */
  paid: number;
  outstanding: number;
  /** Days until due: positive = future, 0 = today, negative = past due */
  daysUntilDue: number;
  status: InvoiceOutstandingStatus;
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${String(fromIso).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(toIso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function todayIso(): string {
  const t = new Date();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${t.getFullYear()}-${m}-${d}`;
}

/**
 * Status for a TI row:
 * - paid: outstanding strictly under Rs 100 (zero and overpayment included)
 * - overdue: Rs 100 or more left and past due date (due today is not overdue)
 * - partially paid: some paid, Rs 100 or more left, not past due
 * - due: unpaid (or zero paid), Rs 100 or more left, not past due
 */
export function invoiceOutstandingStatus(
  outstanding: number,
  paid: number,
  dueDate: string,
  today: string
): InvoiceOutstandingStatus {
  if (!outstandingIsStillDue(outstanding)) return "paid";
  if (dueDate < today) return "overdue";
  if (paid > 0.005) return "partially paid";
  return "due";
}

/** All tax invoices across the workspace for Invoices and Outstandings. */
export function buildInvoiceOutstandingRows(
  data: FlowhubData
): InvoiceOutstandingRow[] {
  const today = todayIso();
  const byContract = new Map(data.contracts.map((c) => [c.id, c]));

  return data.invoices
    .filter((i) => i.type === "TI")
    .slice()
    .sort((a, b) => {
      const ca = byContract.get(a.contractId);
      const cb = byContract.get(b.contractId);
      const pa = ca?.projectNo ?? "";
      const pb = cb?.projectNo ?? "";
      return (
        pa.localeCompare(pb) ||
        a.date.localeCompare(b.date) ||
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
      );
    })
    .map((ti) => {
      const c = byContract.get(ti.contractId);
      const expected = invoiceExpectedCash(ti, data);
      const paid = paymentReceivedTotal(ti.id, data);
      const outstanding = invoiceOutstanding(ti, data);
      const dueDate = invoiceDueDate(ti, data);
      return {
        invoiceId: ti.id,
        contractId: ti.contractId,
        projectNo: c?.projectNo ?? "—",
        projectName: c?.projectName ?? "—",
        city: c?.city ?? "—",
        number: ti.number,
        date: ti.date,
        dueDate,
        finalAmount: ti.finalAmount,
        expected,
        paid,
        outstanding,
        daysUntilDue: daysBetween(today, dueDate),
        status: invoiceOutstandingStatus(outstanding, paid, dueDate, today),
      };
    });
}

/** Sum of outstanding that is still due (Rs 100 and above). Under Rs 100 is left out. */
export function sumOpenOutstanding(rows: InvoiceOutstandingRow[]): number {
  return rows.reduce(
    (s, r) => (outstandingIsStillDue(r.outstanding) ? s + r.outstanding : s),
    0
  );
}

export type OpenPiRow = {
  invoiceId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  client: string;
  city: string;
  number: string;
  date: string;
  finalAmount: number;
  daysOpen: number;
};

/** Open proformas that have not been converted to a TI. */
export function buildOpenPiRows(
  data: FlowhubData,
  opts?: { contractId?: string; city?: string; q?: string }
): OpenPiRow[] {
  const today = todayIso();
  const converted = new Set(
    data.invoices
      .filter((i) => i.type === "TI" && i.convertedFromPiId)
      .map((i) => i.convertedFromPiId as string)
  );
  const city = (opts?.city ?? "").trim().toLowerCase();
  const q = opts?.q ?? "";
  const contractId = opts?.contractId ?? "";

  return data.invoices
    .filter((i) => i.type === "PI" && !converted.has(i.id))
    .filter((i) => !contractId || i.contractId === contractId)
    .map((i) => {
      const c = data.contracts.find((x) => x.id === i.contractId);
      return {
        invoiceId: i.id,
        contractId: i.contractId,
        projectNo: c?.projectNo ?? "—",
        projectName: c?.projectName ?? "—",
        client: c ? contractClientLabel(c) : "—",
        city: c?.city ?? "—",
        number: i.number,
        date: i.date,
        finalAmount: i.finalAmount,
        daysOpen: Math.max(0, daysBetween(i.date, today)),
      };
    })
    .filter((row) => {
      if (city && row.city.toLowerCase() !== city) return false;
      return matchesAny(q, [
        row.projectNo,
        row.projectName,
        row.number,
        row.city,
      ]);
    })
    .sort(
      (a, b) =>
        b.daysOpen - a.daysOpen || a.projectNo.localeCompare(b.projectNo)
    );
}

export function listCities(data: FlowhubData): string[] {
  const set = new Set<string>();
  for (const c of data.contracts) {
    if (c.city.trim()) set.add(c.city.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ——— Sales report ——— */

export type SalesInvoiceRow = {
  invoiceId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Empty when the contract is missing. Not shown or exported. */
  city: string;
  number: string;
  date: string;
  net: number;
  gst: number;
  /** Extra / other charges (post-GST) */
  other: number;
  total: number;
};

/** TI-only invoice lines for Sales → Invoices tab. */
export function buildSalesInvoiceRows(data: FlowhubData): SalesInvoiceRow[] {
  const byContract = new Map(data.contracts.map((c) => [c.id, c]));

  return data.invoices
    .filter((i) => i.type === "TI")
    .slice()
    .sort((a, b) => {
      const ca = byContract.get(a.contractId);
      const cb = byContract.get(b.contractId);
      const pa = ca?.projectNo ?? "";
      const pb = cb?.projectNo ?? "";
      return (
        pa.localeCompare(pb) ||
        a.date.localeCompare(b.date) ||
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
      );
    })
    .map((ti) => {
      const c = byContract.get(ti.contractId);
      return {
        invoiceId: ti.id,
        contractId: ti.contractId,
        projectNo: c?.projectNo ?? "—",
        projectName: c?.projectName ?? "—",
        city: c?.city ?? "",
        number: ti.number,
        date: ti.date,
        net: ti.netAmount,
        gst: ti.gstAmount,
        other: invoiceExtraTotal(ti),
        total: ti.finalAmount,
      };
    });
}

export function sumSalesInvoiceNet(rows: SalesInvoiceRow[]): number {
  return rows.reduce((s, r) => s + r.net, 0);
}

/** Excel / PDF columns for Sales → Invoices. City is searchable and stays off this sheet. */
export const SALES_INVOICE_EXPORT_HEADERS = [
  "Project",
  "Project no.",
  "Invoice no.",
  "Invoice date",
  "Net amount",
  "GST amount",
  "Other amount",
  "Total amount",
] as const;

export function salesInvoiceExportRow(
  row: SalesInvoiceRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    row.number,
    formatDisplayDate(row.date),
    row.net,
    row.gst,
    row.other,
    row.total,
  ];
}

/**
 * Invoice date is inclusive. Text search is AND with that range.
 * City is the contract city; a missing contract has none.
 */
export function filterSalesInvoiceRows(
  rows: SalesInvoiceRow[],
  opts?: { q?: string; dateFrom?: string; dateTo?: string }
): SalesInvoiceRow[] {
  const needle = (opts?.q ?? "").trim();
  const dateFrom = opts?.dateFrom ?? "";
  const dateTo = opts?.dateTo ?? "";
  return rows.filter((r) => {
    if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
    if (!needle) return true;
    return matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.number,
      `TI ${r.number}`,
      r.net,
      r.gst,
      r.other,
      r.total,
      formatDisplayDate(r.date),
    ]);
  });
}

export type SalesContractRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  city: string;
  /** Work-order / contract order value */
  woValue: number;
  /** Σ TI net amounts for this contract */
  totalInvoiceNet: number;
  /** WO − total invoice (net) */
  leftoverBilling: number;
  /** Σ(net + GST + other + recovered) toward outstanding — same as I&O / reconciliation */
  totalPaid: number;
  /**
   * Σ per TI of (billed net − ret%×net − tds%×net − net received).
   * Not totalOutstanding and not totalInvoiceNet.
   */
  totalOutstandingNet: number;
  /** Σ locked outstanding per TI — same helpers as I&O */
  totalOutstanding: number;
};

function linkedNetReceived(ti: Invoice, data: FlowhubData): number {
  let net = 0;
  for (const p of data.payments) {
    if (p.invoiceId !== ti.id || !isTiLinkedPayment(p)) continue;
    net += Number(p.netAmount) || 0;
  }
  return net;
}

/** Billed net − theoretical holds − linked netAmount. Unlinked net is not in yet. */
function netOutstandingBeforeUnlinked(ti: Invoice, data: FlowhubData): number {
  return (
    (Number(ti.netAmount) || 0) -
    invoiceRetentionHold(ti, data) -
    invoiceTdsHold(ti, data) -
    linkedNetReceived(ti, data)
  );
}

/**
 * FIFO-allocate unlinked payments’ netAmount across a contract’s tax invoices,
 * against each TI’s net outstanding (billed net − holds − linked net).
 * Uses payment.netAmount only — not paymentTowardOutstanding (net + GST + other).
 */
function unlinkedNetAmountAllocations(data: FlowhubData): Map<string, number> {
  const allocated = new Map<string, number>();
  const byContract = new Map<string, Payment[]>();
  for (const p of data.payments) {
    if (p.link !== "unlinked") continue;
    const list = byContract.get(p.contractId) ?? [];
    list.push(p);
    byContract.set(p.contractId, list);
  }

  for (const [contractId, pays] of byContract) {
    let pool = pays
      .slice()
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
      )
      .reduce((s, p) => s + (Number(p.netAmount) || 0), 0);

    for (const ti of contractTis(contractId, data)) {
      const need = Math.max(0, netOutstandingBeforeUnlinked(ti, data));
      const take = Math.min(pool, need);
      if (take > 0) {
        allocated.set(ti.id, take);
        pool -= take;
      }
    }
  }
  return allocated;
}

function invoiceRecovered(invoice: Invoice, data: FlowhubData): number {
  let recovered = 0;
  for (const p of data.payments) {
    if (p.invoiceId !== invoice.id || !isTiLinkedPayment(p)) continue;
    recovered += paymentRecovered(p);
  }
  return recovered;
}

/**
 * Net outstanding on one tax invoice:
 * billed net − retention hold − TDS hold − net received.
 * Holds are invoiceRetentionHold / invoiceTdsHold (ret%×net, tds%×net).
 * Net received is linked netAmount plus FIFO-allocated unlinked netAmount.
 * GST, extra charges, other deductions, and payment retention/TDS stay out.
 * A negative result is an overpayment and is returned as-is.
 * Recovered is not cash received. When it would push this net figure negative
 * only by the gap between contract TDS and the TDS on the payment, and the
 * full accounted sum equals the invoice final, the result is 0 — not Extra.
 */
export function invoiceNetOutstanding(
  invoice: Invoice,
  data: FlowhubData
): number {
  if (invoice.type !== "TI") return 0;
  const allocated = unlinkedNetAmountAllocations(data).get(invoice.id) ?? 0;
  const raw = netOutstandingBeforeUnlinked(invoice, data) - allocated;
  const recovered = invoiceRecovered(invoice, data);
  if (
    raw > -0.005 &&
    raw - recovered < -0.005 &&
    invoiceOutstanding(invoice, data) === 0
  ) {
    return 0;
  }
  return raw;
}

/**
 * Contract-level Sales → Contracts tab.
 * Total invoice = sum of TI net; leftover = WO − that sum.
 * Total outstanding reuses locked invoiceOutstanding.
 * Total outstanding net is the sum of invoiceNetOutstanding.
 */
export function buildSalesContractRows(data: FlowhubData): SalesContractRow[] {
  return data.contracts
    .slice()
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo))
    .map((c) => {
      const tis = contractTis(c.id, data);
      const totals = totalsForContract(c.id, tis, data);
      const totalInvoiceNet = tis.reduce((s, ti) => s + ti.netAmount, 0);
      const totalOutstandingNet = tis.reduce(
        (s, ti) => s + invoiceNetOutstanding(ti, data),
        0
      );
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city,
        woValue: c.orderValue,
        totalInvoiceNet,
        leftoverBilling: c.orderValue - totalInvoiceNet,
        totalPaid: totals.paid,
        totalOutstandingNet,
        totalOutstanding: totals.outstanding,
      };
    });
}

/* ——— Accounts report ——— */

export type BankGuaranteeStatus = "active" | "retrieved" | "expired";

export type BankGuaranteeRow = {
  id: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Not shown or exported. */
  city: string;
  type: "ABG" | "PBG";
  number: string;
  date: string;
  value: number;
  bankName: string;
  expiry: string;
  status: BankGuaranteeStatus;
  retrievalDate: string | null;
};

function guaranteeHasDetails(
  number: string | null,
  date: string | null,
  expiry: string | null
): boolean {
  return Boolean(number && date && expiry);
}

function bankGuaranteeStatus(
  retrieved: boolean,
  expiry: string,
  today: string
): BankGuaranteeStatus {
  if (retrieved) return "retrieved";
  if (expiry && expiry < today) return "expired";
  return "active";
}

/** One row per ABG/PBG that has details entered (number + date + expiry). */
export function buildBankGuaranteeRows(data: FlowhubData): BankGuaranteeRow[] {
  const today = todayIso();
  const rows: BankGuaranteeRow[] = [];

  for (const c of data.contracts) {
    if (guaranteeHasDetails(c.abgNumber, c.abgDate, c.abgExpiry)) {
      const value =
        c.abgValue ??
        (c.abgPercent != null ? (c.orderValue * c.abgPercent) / 100 : 0);
      rows.push({
        id: `${c.id}-abg`,
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city ?? "",
        type: "ABG",
        number: c.abgNumber!,
        date: c.abgDate!,
        value: value ?? 0,
        bankName: c.abgBankName?.trim() || "—",
        expiry: c.abgExpiry!,
        status: bankGuaranteeStatus(
          c.abgRetrieved,
          c.abgExpiry!,
          today
        ),
        retrievalDate: c.abgRetrieved ? c.abgRetrievedDate : null,
      });
    }
    if (guaranteeHasDetails(c.pbgNumber, c.pbgDate, c.pbgExpiry)) {
      const value =
        c.pbgValue ??
        (c.pbgPercent != null ? (c.orderValue * c.pbgPercent) / 100 : 0);
      rows.push({
        id: `${c.id}-pbg`,
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city ?? "",
        type: "PBG",
        number: c.pbgNumber!,
        date: c.pbgDate!,
        value: value ?? 0,
        bankName: c.pbgBankName?.trim() || "—",
        expiry: c.pbgExpiry!,
        status: bankGuaranteeStatus(
          c.pbgRetrieved,
          c.pbgExpiry!,
          today
        ),
        retrievalDate: c.pbgRetrieved ? c.pbgRetrievedDate : null,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.projectNo.localeCompare(b.projectNo) ||
      a.type.localeCompare(b.type) ||
      a.date.localeCompare(b.date)
  );
}

/** Excel / PDF columns for Accounts → Bank guarantees. City stays off this sheet. */
export const BANK_GUARANTEE_EXPORT_HEADERS = [
  "PROJECT",
  "PROJECT NO.",
  "TYPE",
  "GUARANTEE #",
  "DATE",
  "VALUE",
  "BANK",
  "EXPIRY",
  "STATUS",
  "RETRIEVAL",
] as const;

export function bankGuaranteeExportRow(
  row: BankGuaranteeRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    row.type,
    row.number,
    formatDisplayDate(row.date),
    row.value,
    row.bankName,
    formatDisplayDate(row.expiry),
    row.status === "active"
      ? "Active"
      : row.status === "retrieved"
        ? "Retrieved"
        : "Expired",
    row.retrievalDate ? formatDisplayDate(row.retrievalDate) : "",
  ];
}

export function filterBankGuaranteeRows(
  rows: BankGuaranteeRow[],
  q?: string
): BankGuaranteeRow[] {
  const needle = (q ?? "").trim();
  if (!needle) return rows;
  return rows.filter((r) =>
    matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.type,
      r.number,
      r.bankName,
      r.status,
      r.value,
      formatDisplayDate(r.date),
      formatDisplayDate(r.expiry),
      r.retrievalDate ? formatDisplayDate(r.retrievalDate) : "",
    ])
  );
}

export type RetentionReportStatus =
  | { kind: "recovered"; recoveredAt: string }
  | { kind: "undue" }
  | { kind: "due"; daysUntilDue: number; dueDate: string };

export type RetentionHeldRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Not shown or exported. */
  city: string;
  /** Actual retention held from payments (locked money rules) */
  retentionHeld: number;
  handoverDate: string | null;
  dlpEnd: string | null;
  status: RetentionReportStatus;
};

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Contracts with actual retention held from payments.
 * Status: Recovered · Undue (no contract handover date) · Due in N days
 * (DLP end counted from that date; negative if overdue).
 * A schedule handover line does not start this clock.
 */
export function buildRetentionHeldRows(data: FlowhubData): RetentionHeldRow[] {
  const today = todayIso();
  return data.contracts
    .map((c) => {
      const retentionHeld = contractActualRetentionHold(c.id, data);
      return { c, retentionHeld };
    })
    .filter(({ retentionHeld }) => retentionHeld > 0.005)
    .map(({ c, retentionHeld }) => {
      const handoverDate = handoverDateForContract(data, c.id);
      const dlpEnd =
        handoverDate != null
          ? addMonthsIso(handoverDate, c.dlpMonths || 0)
          : null;
      let status: RetentionReportStatus;
      if (c.retentionRecoveredAt) {
        status = { kind: "recovered", recoveredAt: c.retentionRecoveredAt };
      } else if (!handoverDate || !dlpEnd) {
        status = { kind: "undue" };
      } else {
        status = {
          kind: "due",
          daysUntilDue: daysBetween(today, dlpEnd),
          dueDate: dlpEnd,
        };
      }
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city ?? "",
        retentionHeld,
        handoverDate,
        dlpEnd,
        status,
      };
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
}

/** Excel / PDF columns for Accounts → Retentions. City stays off this sheet. */
export const RETENTION_EXPORT_HEADERS = [
  "PROJECT",
  "PROJECT NO.",
  "RETENTION HELD",
  "STATUS",
  "RECOVERED ON",
] as const;

export function retentionExportRow(
  row: RetentionHeldRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    row.retentionHeld,
    formatRetentionStatusLabel(row.status),
    row.status.kind === "recovered"
      ? formatDisplayDate(row.status.recoveredAt)
      : "",
  ];
}

export function filterRetentionHeldRows(
  rows: RetentionHeldRow[],
  q?: string
): RetentionHeldRow[] {
  const needle = (q ?? "").trim();
  if (!needle) return rows;
  return rows.filter((r) =>
    matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.retentionHeld,
      formatRetentionStatusLabel(r.status),
      r.status.kind === "recovered"
        ? formatDisplayDate(r.status.recoveredAt)
        : "",
      r.handoverDate ? formatDisplayDate(r.handoverDate) : "",
    ])
  );
}

export type ExpenseReportRow = {
  expenseId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Not shown or exported. */
  city: string;
  date: string;
  category: string;
  personPaid: string;
  amount: number;
};

/** Non-deleted expenses across contracts (default list). */
export function buildExpenseReportRows(data: FlowhubData): ExpenseReportRow[] {
  const rows: ExpenseReportRow[] = [];
  for (const c of data.contracts) {
    for (const e of c.expenses ?? []) {
      if (e.deletedAt) continue;
      rows.push({
        expenseId: e.id,
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city ?? "",
        date: e.date,
        category: e.category || "Miscellaneous",
        personPaid: e.personPaid || "—",
        amount: Number(e.amount) || 0,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.projectNo.localeCompare(b.projectNo) ||
      a.expenseId.localeCompare(b.expenseId)
  );
}

/** Excel / PDF columns for Accounts → Expenses. City stays off this sheet. */
export const EXPENSE_REPORT_EXPORT_HEADERS = [
  "PROJECT",
  "PROJECT NO.",
  "DATE",
  "EXPENSE TYPE",
  "EXPENSE PERSON",
  "AMOUNT",
] as const;

export function expenseReportExportRow(
  row: ExpenseReportRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    formatDisplayDate(row.date),
    row.category,
    row.personPaid,
    row.amount,
  ];
}

/** Expense date is inclusive. Text search is AND with that range. */
export function filterExpenseReportRows(
  rows: ExpenseReportRow[],
  opts?: { q?: string; dateFrom?: string; dateTo?: string }
): ExpenseReportRow[] {
  const needle = (opts?.q ?? "").trim();
  const dateFrom = opts?.dateFrom ?? "";
  const dateTo = opts?.dateTo ?? "";
  return rows.filter((r) => {
    if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
    if (!needle) return true;
    return matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.category,
      r.personPaid,
      r.amount,
      formatDisplayDate(r.date),
    ]);
  });
}

export type CollectionReportRow = {
  paymentId: string;
  contractId: string;
  /** Set when Against is an invoice number that still exists. */
  invoiceId: string | null;
  projectNo: string;
  projectName: string;
  /** Contract city. Empty when the contract is missing. Not shown or exported. */
  city: string;
  date: string;
  /** Tax invoice number, proforma number, “Recoverable”, or “Unlinked”. */
  against: string;
  /** Payment net only. Retention, TDS, other deductions, and recovered stay out. */
  cashReceivedNet: number;
  /** Payment GST only. Retention, TDS, other deductions, and recovered stay out. */
  cashReceivedGst: number;
  /** Payment net + GST. Retention, TDS, other deductions, and recovered stay out. */
  cashReceived: number;
  retention: number;
  tds: number;
  otherDeductions: number;
};

/** Net on the payments that already make up cash received. Holds and deductions stay out. */
export function collectionCashReceivedNet(p: Payment): number {
  return Number(p.netAmount) || 0;
}

/** GST on the payments that already make up cash received. Holds and deductions stay out. */
export function collectionCashReceivedGst(p: Payment): number {
  return Number(p.gstAmount) || 0;
}

/**
 * Cash received total on a collection row: payment net + GST.
 * Retention, TDS, other deductions, and a `recovered` amount (when that field
 * exists) are not part of this figure.
 */
export function collectionCashReceived(p: Payment): number {
  return collectionCashReceivedNet(p) + collectionCashReceivedGst(p);
}

function paymentLinkValue(p: Payment): string {
  return String((p as { link?: string | null }).link ?? "");
}

/** Against label for one payment. A `recoverable` link wins over any invoice. */
export function collectionAgainstLabel(
  p: Payment,
  invoice: Invoice | undefined
): string {
  const link = paymentLinkValue(p);
  if (link === "recoverable") return "Recoverable";
  if (link === "unlinked") return "Unlinked";
  const number = invoice?.number?.trim();
  if (number) return number;
  return "Unlinked";
}

/**
 * One row per payment, including proforma and unlinked payments.
 * Newest payment date first. Does not read a `recovered` field.
 */
export function buildCollectionRows(data: FlowhubData): CollectionReportRow[] {
  const contracts = new Map(data.contracts.map((c) => [c.id, c]));
  const invoices = new Map(data.invoices.map((i) => [i.id, i]));

  return (data.payments ?? [])
    .slice()
    .sort((a, b) => {
      const byDate = String(b.date ?? "").localeCompare(String(a.date ?? ""));
      if (byDate) return byDate;
      const projectA = contracts.get(a.contractId)?.projectNo ?? "";
      const projectB = contracts.get(b.contractId)?.projectNo ?? "";
      const byProject = projectA.localeCompare(projectB);
      if (byProject) return byProject;
      const byCreated = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      if (byCreated) return byCreated;
      return a.id.localeCompare(b.id);
    })
    .map((p) => {
      const contract = contracts.get(p.contractId);
      const invoice = p.invoiceId ? invoices.get(p.invoiceId) : undefined;
      const link = paymentLinkValue(p);
      const against = collectionAgainstLabel(p, invoice);
      const linkedInvoice =
        against !== "Recoverable" &&
        against !== "Unlinked" &&
        link !== "unlinked" &&
        invoice
          ? invoice.id
          : null;
      return {
        paymentId: p.id,
        contractId: contract ? p.contractId : "",
        invoiceId: linkedInvoice,
        projectNo: contract?.projectNo ?? "—",
        projectName: contract?.projectName ?? "—",
        city: contract?.city ?? "",
        date: p.date,
        against,
        cashReceivedNet: collectionCashReceivedNet(p),
        cashReceivedGst: collectionCashReceivedGst(p),
        cashReceived: collectionCashReceived(p),
        retention: Number(p.retentionAmount) || 0,
        tds: Number(p.tdsAmount) || 0,
        otherDeductions: Number(p.otherDeductions) || 0,
      };
    });
}

/** Payment date is inclusive. An empty from or to leaves that side open. */
export function filterCollectionRows(
  rows: CollectionReportRow[],
  opts?: { q?: string; dateFrom?: string; dateTo?: string }
): CollectionReportRow[] {
  const needle = (opts?.q ?? "").trim();
  const dateFrom = opts?.dateFrom ?? "";
  const dateTo = opts?.dateTo ?? "";
  return rows.filter((r) => {
    if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
    if (!needle) return true;
    return matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.against,
      r.cashReceivedNet,
      r.cashReceivedGst,
      r.cashReceived,
      r.retention,
      r.tds,
      r.otherDeductions,
      formatMoney(r.cashReceivedNet),
      formatMoney(r.cashReceivedGst),
      formatMoney(r.cashReceived),
      formatMoney(r.retention),
      formatMoney(r.tds),
      formatMoney(r.otherDeductions),
      ...dateSearchForms(r.date),
    ]);
  });
}

/** Excel / PDF columns for Accounts → Collections. City stays off this sheet. */
export const COLLECTION_EXPORT_HEADERS = [
  "DATE",
  "CONTRACT",
  "PROJECT NO.",
  "AGAINST",
  "CASH RECEIVED NET",
  "CASH RECEIVED GST",
  "CASH RECEIVED TOTAL",
  "RETENTION",
  "TDS",
  "OTHER DEDUCTIONS",
] as const;

export function collectionExportRow(
  row: CollectionReportRow
): (string | number)[] {
  return [
    formatDisplayDate(row.date),
    row.projectName,
    row.projectNo,
    row.against,
    row.cashReceivedNet,
    row.cashReceivedGst,
    row.cashReceived,
    row.retention,
    row.tds,
    row.otherDeductions,
  ];
}

/** Sum of cash received on the rows still in the list. Holds and deductions stay out. */
export function sumCollectionCashReceived(rows: CollectionReportRow[]): number {
  return rows.reduce((sum, row) => sum + row.cashReceived, 0);
}

export type CollectionColumnTotals = {
  cashReceivedNet: number;
  cashReceivedGst: number;
  cashReceived: number;
  retention: number;
  tds: number;
  otherDeductions: number;
};

/** Column sums for the rows still in the list. Cash total is net plus GST. */
export function sumCollectionColumns(
  rows: CollectionReportRow[]
): CollectionColumnTotals {
  const totals: CollectionColumnTotals = {
    cashReceivedNet: 0,
    cashReceivedGst: 0,
    cashReceived: 0,
    retention: 0,
    tds: 0,
    otherDeductions: 0,
  };
  for (const row of rows) {
    totals.cashReceivedNet += row.cashReceivedNet;
    totals.cashReceivedGst += row.cashReceivedGst;
    totals.cashReceived += row.cashReceived;
    totals.retention += row.retention;
    totals.tds += row.tds;
    totals.otherDeductions += row.otherDeductions;
  }
  return totals;
}

export function formatRetentionStatusLabel(status: RetentionReportStatus): string {
  if (status.kind === "recovered") return "Recovered";
  if (status.kind === "undue") return "Undue";
  return `Due in ${status.daysUntilDue} days`;
}
