/**
 * Nexus Core figures. The contract handover date is the only handover
 * the hub uses. Schedule handover lines stay targets and are ignored here.
 */

import {
  EMPTY_NEXUS_COSTS,
  type Contract,
  type FlowhubData,
  type NexusCosts,
  type Payment,
} from "@/lib/types";

export function todayIso(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Indian financial year: 1 April through 31 March. */
export function financialYear(today: string): {
  start: string;
  end: string;
  label: string;
} {
  const [yRaw, mRaw] = today.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  const startYear = m >= 4 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    start: `${startYear}-04-01`,
    end: `${endYear}-03-31`,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
  };
}

export function isoInRange(
  value: string | null | undefined,
  start: string,
  end: string
): boolean {
  const d = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d >= start && d <= end;
}

const CORE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Calendar day as "13 Oct 2026". */
export function formatCoreDay(iso: string): string {
  const [y, m, d] = String(iso ?? "").slice(0, 10).split("-");
  const month = CORE_MONTHS[Number(m) - 1];
  if (!y || !month || !d) return String(iso ?? "");
  return `${Number(d)} ${month} ${y}`;
}

/** Rupees → 0.00L (rupees / 100000). Never spells the unit in words. */
export function formatCoreMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  if (Math.abs(v) < 0.005) return "0.00L";
  const sign = v < 0 ? "-" : "";
  return `${sign}${(Math.abs(v) / 100000).toFixed(2)}L`;
}

export function formatCorePercent(percent: number | null): string {
  if (percent == null || !Number.isFinite(percent)) return "—";
  if (Math.abs(percent) < 0.005) return "0.00%";
  const sign = percent < 0 ? "-" : "";
  return `${sign}${Math.abs(percent).toFixed(2)}%`;
}

export type ProfitPercentTone = "green" | "yellow" | "red";

/**
 * Colour for a profit/loss percent already calculated as
 * (comparison − cumulative cost) / comparison.
 * 20 and above is green. From 5 up to (not including) 20 is yellow.
 * Below 5 is red, including 0. A loss is always red: a negative
 * profit amount, or a negative percent, even when the percent looks large.
 * No percent (comparison is zero) stays uncoloured unless the amount is a loss.
 */
export function profitPercentTone(
  profit: number,
  percent: number | null
): ProfitPercentTone | null {
  const pct = percent != null && Number.isFinite(percent) ? percent : null;
  const loss = profit < -0.005 || (pct != null && pct < -0.005);
  if (loss) return "red";
  if (pct == null) return null;
  if (pct >= 20) return "green";
  if (pct >= 5) return "yellow";
  return "red";
}

function rupeeOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Spent and Yet to spend only. A direct cost already saved becomes Yet to spend.
 * Spent stays empty until it is saved. Cost columns and BOQ rates are dropped.
 */
export function normalizeNexusCosts(raw: unknown): NexusCosts {
  const src =
    raw && typeof raw === "object" ? (raw as { contracts?: unknown }) : {};
  const rawContracts =
    src.contracts && typeof src.contracts === "object" && !Array.isArray(src.contracts)
      ? (src.contracts as Record<string, unknown>)
      : {};
  const contracts: NexusCosts["contracts"] = {};
  for (const [contractId, entry] of Object.entries(rawContracts)) {
    if (!contractId || !entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const spent = rupeeOrNull(row.spent);
    const yetToSpend = Object.prototype.hasOwnProperty.call(row, "yetToSpend")
      ? rupeeOrNull(row.yetToSpend)
      : rupeeOrNull(row.directCost);
    if (spent == null && yetToSpend == null) continue;
    contracts[contractId] = { spent, yetToSpend };
  }
  if (!Object.keys(contracts).length) return EMPTY_NEXUS_COSTS;
  return { contracts };
}

/** A real calendar date, or null. Does not read a schedule line. */
export function acceptedHandoverDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const [ys, ms, ds] = d.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const day = Number(ds);
  const dt = new Date(Date.UTC(y, m - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

/**
 * Date to store after the contract-page confirm.
 * Nothing is saved until confirmed, and the new date replaces the old one.
 */
export function handoverDateToSave(
  entered: string,
  confirmed: boolean
): string | null {
  if (!confirmed) return null;
  return acceptedHandoverDate(entered);
}

/**
 * The contract's handover date. Empty until it is confirmed on the contract.
 * A schedule handover line is not this date.
 */
export function handoverDateForContract(
  data: FlowhubData,
  contractId: string
): string | null {
  const contract = data.contracts.find((c) => c.id === contractId);
  return acceptedHandoverDate(contract?.handoverDate);
}

/**
 * Handed over only when the contract date is a real date of today or earlier.
 * An empty date, a future date, and a schedule line marked done are not.
 */
export function contractIsHandedOver(
  data: FlowhubData,
  contractId: string,
  today: string
): boolean {
  const date = handoverDateForContract(data, contractId);
  return !!date && date <= today.slice(0, 10);
}

/**
 * Screen status from the contract date.
 * A stored completed word without a qualifying date is not Completed.
 * On hold stays On hold until the date is today or earlier.
 */
export function contractShownStatus(
  contract: Pick<Contract, "status" | "handoverDate">,
  today: string
): ContractStatusLabel {
  const date = acceptedHandoverDate(contract.handoverDate);
  if (date && date <= today.slice(0, 10)) return "Completed";
  const stored = contractStatusLabel(contract.status);
  if (stored === "Completed") return "Active";
  return stored;
}

export function taxInvoiceNet(data: FlowhubData, contractId: string): number {
  return data.invoices
    .filter((i) => i.type === "TI" && i.contractId === contractId)
    .reduce((s, i) => s + (Number(i.netAmount) || 0), 0);
}

/** Work-order value until handover, tax-invoice nets after handover. */
export function comparisonValue(
  data: FlowhubData,
  contract: Contract,
  today: string
): number {
  if (contractIsHandedOver(data, contract.id, today)) {
    return taxInvoiceNet(data, contract.id);
  }
  return Number(contract.orderValue) || 0;
}

export function fyNetInvoiceValue(
  data: FlowhubData,
  fy: { start: string; end: string }
): number {
  return data.invoices
    .filter((i) => i.type === "TI" && isoInRange(i.date, fy.start, fy.end))
    .reduce((s, i) => s + (Number(i.netAmount) || 0), 0);
}

/** Cash received (net + GST) on TI-linked and unlinked payments in the year. */
export function fyCollection(
  data: FlowhubData,
  fy: { start: string; end: string }
): number {
  return data.payments
    .filter((p) => {
      if (p.link === "PI") return false;
      if (!(p.link === "TI" || p.link === "unlinked" || !p.link)) return false;
      return isoInRange(p.date, fy.start, fy.end);
    })
    .reduce(
      (s, p) => s + (Number(p.netAmount) || 0) + (Number(p.gstAmount) || 0),
      0
    );
}

/**
 * ABG + PBG still with the bank. A guarantee marked retrieved
 * (abgRetrieved / pbgRetrieved) is left out.
 */
export function bankGuaranteeTotal(data: FlowhubData): number {
  return data.contracts.reduce((s, c) => {
    const abg = c.abgRetrieved ? 0 : Number(c.abgValue) || 0;
    const pbg = c.pbgRetrieved ? 0 : Number(c.pbgValue) || 0;
    return s + abg + pbg;
  }, 0);
}

export function contractExpenseTotal(contract: Contract): number {
  return (contract.expenses ?? [])
    .filter((e) => !e.deletedAt)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

function amountOrZero(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? value : 0;
}

/** Spent, Yet to spend, and their sum. That sum is the contract cost. */
export function contractSpend(
  contractId: string,
  costs: NexusCosts
): { spent: number; yetToSpend: number; contractCost: number } {
  const entry = costs.contracts[contractId];
  const spent = amountOrZero(entry?.spent);
  const yetToSpend = amountOrZero(entry?.yetToSpend);
  return { spent, yetToSpend, contractCost: spent + yetToSpend };
}

/** Contract cost: Spent + Yet to spend. Expenses are not included. */
export function contractCostAmount(
  contract: Pick<Contract, "id">,
  costs: NexusCosts
): number {
  return contractSpend(contract.id, costs).contractCost;
}

/** Profit or loss percent of the selling price. Null when selling is zero. */
export function profitPercentOf(
  profit: number,
  selling: number
): number | null {
  if (!Number.isFinite(profit) || !Number.isFinite(selling)) return null;
  if (Math.abs(selling) < 0.005) return null;
  return (profit / selling) * 100;
}

export type ContractStatusLabel = "Active" | "On hold" | "Completed";

/** Stored value for a status the user may set. Completed is handover-only. */
export function storedContractStatus(
  label: "Active" | "On hold"
): "active" | "on_hold" {
  return label === "On hold" ? "on_hold" : "active";
}

/**
 * Screen label: Active, On hold, or Completed.
 * complete/completed → Completed, on hold → On hold, anything else live → Active.
 */
export function contractStatusLabel(status: string): ContractStatusLabel {
  const raw = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (
    raw === "complete" ||
    raw === "completed" ||
    raw === "closed" ||
    raw === "done"
  ) {
    return "Completed";
  }
  if (raw === "on hold" || raw === "hold") return "On hold";
  return "Active";
}

/**
 * Completed only when the contract handover date is today or earlier.
 * A stored completed word from an old schedule line does not count.
 * On hold stays On hold until that date.
 */
export function contractDisplayStatus(
  data: FlowhubData,
  contract: Pick<Contract, "id" | "status">,
  today: string
): ContractStatusLabel {
  const row = data.contracts.find((c) => c.id === contract.id);
  return contractShownStatus(
    {
      status: row?.status ?? contract.status,
      handoverDate: row?.handoverDate ?? null,
    },
    today
  );
}

export type CostCentreRow = {
  contractId: string;
  projectName: string;
  projectNo: string;
  city: string;
  status: ContractStatusLabel;
  workOrder: number;
  spent: number;
  yetToSpend: number;
  contractCost: number;
  expenses: number;
  cumulative: number;
  comparison: number;
  profit: number;
  profitPercent: number | null;
};

export function buildCostCentreRows(
  data: FlowhubData,
  today: string
): CostCentreRow[] {
  const costs = normalizeNexusCosts(data.nexusCosts);
  return data.contracts
    .slice()
    .sort(
      (a, b) =>
        a.projectNo.localeCompare(b.projectNo) ||
        a.projectName.localeCompare(b.projectName)
    )
    .map((c) => {
      const spend = contractSpend(c.id, costs);
      const expenses = contractExpenseTotal(c);
      const cumulative = spend.contractCost + expenses;
      const comparison = comparisonValue(data, c, today);
      const profit = comparison - cumulative;
      return {
        contractId: c.id,
        projectName: c.projectName,
        projectNo: c.projectNo,
        city: c.city || "—",
        status: contractDisplayStatus(data, c, today),
        workOrder: Number(c.orderValue) || 0,
        spent: spend.spent,
        yetToSpend: spend.yetToSpend,
        contractCost: spend.contractCost,
        expenses,
        cumulative,
        comparison,
        profit,
        profitPercent: profitPercentOf(profit, comparison),
      };
    });
}

export type CostSellingParts = {
  selling: number;
  contractCost: number;
  expenses: number;
  retentionHeld: number;
};

export type CostSellingPie = CostSellingParts & {
  cost: number;
  profit: number;
  loss: boolean;
};

/**
 * With retention: selling − expenses − contract costs.
 * Without retention: that result minus retention held.
 */
export function costSellingPie(
  parts: CostSellingParts,
  withRetention: boolean
): CostSellingPie {
  const base = parts.contractCost + parts.expenses;
  const cost = withRetention ? base : base + Math.max(0, parts.retentionHeld);
  const profit = parts.selling - cost;
  return {
    ...parts,
    cost,
    profit,
    loss: profit < -0.005,
  };
}

export type BillingBar = {
  key: string;
  label: string;
  wo: number;
  billed: number;
};

export function contractCityName(contract: Pick<Contract, "city">): string {
  const name = String(contract.city ?? "").trim();
  return name || "—";
}

/** Distinct city names, alphabetical. */
export function contractCities(contracts: readonly Contract[]): string[] {
  return [...new Set(contracts.map((c) => contractCityName(c)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * One bar per city: work-order value and billed tax-invoice nets,
 * summed across the contracts in that city. `city` empty means every city.
 */
export function billingCityBars(
  contracts: readonly Contract[],
  data: FlowhubData,
  city = ""
): BillingBar[] {
  const selected = city
    ? contracts.filter((c) => contractCityName(c) === city)
    : contracts;
  const map = new Map<string, BillingBar>();
  for (const c of selected) {
    const label = contractCityName(c);
    const row = map.get(label) ?? { key: label, label, wo: 0, billed: 0 };
    row.wo += Number(c.orderValue) || 0;
    row.billed += taxInvoiceNet(data, c.id);
    map.set(label, row);
  }
  return [...map.values()].sort(
    (a, b) => b.wo - a.wo || a.label.localeCompare(b.label)
  );
}

/** Top of the billing scale: the largest city's work-order value. */
export function billingScaleMax(workOrders: readonly number[]): number {
  let max = 0;
  for (const wo of workOrders) {
    const n = Number(wo);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Percents of the pie slices. They add to 100 at two decimal places.
 * A slice of zero stays 0 and is left out of that sum.
 */
export function piePercents(values: readonly number[]): number[] {
  const positive = values.map((value) =>
    Number.isFinite(value) && value > 0.005 ? value : 0
  );
  const total = positive.reduce((sum, value) => sum + value, 0);
  const out = positive.map(() => 0);
  if (total <= 0.005) return out;
  const indexes = positive
    .map((value, index) => (value > 0 ? index : -1))
    .filter((index) => index >= 0);
  let used = 0;
  indexes.forEach((index, n) => {
    if (n === indexes.length - 1) {
      out[index] = Math.round((100 - used) * 100) / 100;
      return;
    }
    const percent = Math.round((positive[index] / total) * 10000) / 100;
    out[index] = percent;
    used += percent;
  });
  return out;
}

export function wholeRupees(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

const WHOLE_RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatWholeRupees(n: number): string {
  return WHOLE_RUPEES.format(wholeRupees(n));
}

/** Work-order value minus tax invoices already made. */
export function yetToBillAmount(
  workOrder: number,
  taxInvoiceNets: number
): number {
  return (Number(workOrder) || 0) - (Number(taxInvoiceNets) || 0);
}

/**
 * Work-order value, minus retention and TDS as percents of that value,
 * minus each payment's net, GST, and other deductions.
 * A contract with no GST does not take GST off its payments.
 */
export function yetToCollectAmount(
  contract: Pick<
    Contract,
    "orderValue" | "retentionPercent" | "tdsPercent" | "gstApplicable"
  >,
  payments: readonly Pick<Payment, "netAmount" | "gstAmount" | "otherDeductions">[]
): number {
  const workOrder = Number(contract.orderValue) || 0;
  const retention = (workOrder * (Number(contract.retentionPercent) || 0)) / 100;
  const tds = (workOrder * (Number(contract.tdsPercent) || 0)) / 100;
  let taken = retention + tds;
  for (const payment of payments) {
    taken += Number(payment.netAmount) || 0;
    if (contract.gstApplicable) taken += Number(payment.gstAmount) || 0;
    taken += Number(payment.otherDeductions) || 0;
  }
  return workOrder - taken;
}

export type CoreReportRow = {
  contractId: string;
  projectName: string;
  projectNo: string;
  city: string;
  status: ContractStatusLabel;
  workOrder: number;
  yetToBill: number;
  yetToCollect: number;
  spent: number;
  yetToSpend: number;
  profit: number;
  profitPercent: number | null;
  selling: number;
};

export function buildCoreReportRows(
  data: FlowhubData,
  today: string
): CoreReportRow[] {
  const costs = normalizeNexusCosts(data.nexusCosts);
  return data.contracts
    .slice()
    .sort(
      (a, b) =>
        a.projectNo.localeCompare(b.projectNo) ||
        a.projectName.localeCompare(b.projectName)
    )
    .map((contract) => {
      const spend = contractSpend(contract.id, costs);
      const expenses = contractExpenseTotal(contract);
      const cumulative = spend.contractCost + expenses;
      const selling = comparisonValue(data, contract, today);
      const profit = selling - cumulative;
      const workOrder = Number(contract.orderValue) || 0;
      const payments = data.payments.filter(
        (payment) => payment.contractId === contract.id
      );
      return {
        contractId: contract.id,
        projectName: contract.projectName,
        projectNo: contract.projectNo,
        city: contract.city || "—",
        status: contractDisplayStatus(data, contract, today),
        workOrder,
        yetToBill: yetToBillAmount(workOrder, taxInvoiceNet(data, contract.id)),
        yetToCollect: yetToCollectAmount(contract, payments),
        spent: spend.spent,
        yetToSpend: spend.yetToSpend,
        profit,
        profitPercent: profitPercentOf(profit, selling),
        selling,
      };
    });
}
