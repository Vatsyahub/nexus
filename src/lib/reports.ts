/**
 * Report builders for Nexus (REPORTS.md).
 * Money rules stay TI-driven — same helpers as billing/payments.
 *
 * Locked money rules (reports):
 * - Expected payment / expected held = theoretical (ret%×net, tds%×net).
 * - Retention held / TDS held columns = actual sums from payment entries.
 * - Unlinked ret/TDS count in contract-level actual held; TI rows show linked only.
 * - Outstanding = Expected − Σ(net + GST + other + recovered on that TI); ret/TDS not subtracted.
 *   Recoverable-link cash does not reduce a TI and is not in the unlinked FIFO.
 * - Sales “Total outstanding net” = Σ (TI net − ret%×net − tds%×net − net received).
 *   Net received is linked payment netAmount plus FIFO of unlinked netAmount only.
 *   GST, extras, other deductions, retention cash, and TDS cash stay out.
 */

import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";
import { isScheduleDateNa } from "@/lib/types";
import { matchesAny } from "@/lib/list-search";
import { dateSearchForms, isDateInInclusiveRange } from "@/lib/dates";
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

/**
 * Net outstanding on one tax invoice:
 * billed net − retention hold − TDS hold − net received.
 * Holds are invoiceRetentionHold / invoiceTdsHold (ret%×net, tds%×net).
 * Net received is linked netAmount plus FIFO-allocated unlinked netAmount.
 * GST, extra charges, other deductions, and payment retention/TDS stay out.
 * A negative result is an overpayment and is returned as-is.
 */
export function invoiceNetOutstanding(
  invoice: Invoice,
  data: FlowhubData
): number {
  if (invoice.type !== "TI") return 0;
  const allocated = unlinkedNetAmountAllocations(data).get(invoice.id) ?? 0;
  return netOutstandingBeforeUnlinked(invoice, data) - allocated;
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

export type RetentionReportStatus =
  | { kind: "recovered"; recoveredAt: string }
  | { kind: "undue" }
  | { kind: "due"; daysUntilDue: number; dueDate: string };

export type RetentionHeldRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
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

function handoverDateForReport(
  data: FlowhubData,
  contractId: string
): string | null {
  const line = data.schedules.find(
    (s) => s.contractId === contractId && s.kind === "handover"
  );
  const d = line?.endDate || line?.startDate || null;
  if (!d || isScheduleDateNa(d)) return null;
  return d;
}

/**
 * Contracts with actual retention held from payments.
 * Status: Recovered · Undue (no handover) · Due in N days (DLP end; negative if overdue).
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
      const handoverDate = handoverDateForReport(data, c.id);
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
        retentionHeld,
        handoverDate,
        dlpEnd,
        status,
      };
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
}

export type ExpenseReportRow = {
  expenseId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
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

export type CollectionReportRow = {
  paymentId: string;
  contractId: string;
  /** Set when Against is an invoice number that still exists. */
  invoiceId: string | null;
  projectNo: string;
  projectName: string;
  date: string;
  /** Tax invoice number, proforma number, “Recoverable”, or “Unlinked”. */
  against: string;
  /** Payment net + GST only. Retention, TDS, other deductions, and recovered stay out. */
  cashReceived: number;
  retention: number;
  tds: number;
  otherDeductions: number;
};

/**
 * Cash received on a collection row: payment net + GST.
 * Retention, TDS, other deductions, and a `recovered` amount (when that field
 * exists) are not part of this figure.
 */
export function collectionCashReceived(p: Payment): number {
  return (Number(p.netAmount) || 0) + (Number(p.gstAmount) || 0);
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
        date: p.date,
        against,
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
      r.against,
      r.cashReceived,
      r.retention,
      r.tds,
      r.otherDeductions,
      formatMoney(r.cashReceived),
      formatMoney(r.retention),
      formatMoney(r.tds),
      formatMoney(r.otherDeductions),
      ...dateSearchForms(r.date),
    ]);
  });
}

/** Sum of cash received on the rows still in the list. Holds and deductions stay out. */
export function sumCollectionCashReceived(rows: CollectionReportRow[]): number {
  return rows.reduce((sum, row) => sum + row.cashReceived, 0);
}

export function formatRetentionStatusLabel(status: RetentionReportStatus): string {
  if (status.kind === "recovered") return "Recovered";
  if (status.kind === "undue") return "Undue";
  return `Due in ${status.daysUntilDue} days`;
}
