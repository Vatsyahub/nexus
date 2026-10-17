/**
 * Nexus Core figures. Handover uses the same schedule line the hub already
 * uses for DLP and workorders: end date, else start date, ignoring NA.
 * The line's done flag is the completion mark schedules already store.
 */

import {
  EMPTY_NEXUS_COSTS,
  isScheduleDateNa,
  type BoqItem,
  type Contract,
  type FlowhubData,
  type NexusCostColumn,
  type NexusCosts,
  type ScheduleLine,
} from "@/lib/types";
import { handoverByContract, workspaceIndex } from "@/lib/workspace-index";

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

export function normalizeNexusCosts(raw: unknown): NexusCosts {
  const src =
    raw && typeof raw === "object" ? (raw as Partial<NexusCosts>) : {};
  const columns: NexusCostColumn[] = [];
  const seenIds = new Set<string>();
  const seenHeaders = new Set<string>();
  for (const col of Array.isArray(src.columns) ? src.columns : []) {
    if (!col || typeof col !== "object") continue;
    const id = String(col.id ?? "").trim();
    const header = String(col.header ?? "")
      .trim()
      .replace(/\s+/g, " ");
    if (!id || !header) continue;
    const headerKey = header.toLowerCase();
    if (seenIds.has(id) || seenHeaders.has(headerKey)) continue;
    seenIds.add(id);
    seenHeaders.add(headerKey);
    columns.push({ id, header });
  }
  const columnIds = new Set(columns.map((c) => c.id));
  const contracts: NexusCosts["contracts"] = {};
  const rawContracts =
    src.contracts && typeof src.contracts === "object" ? src.contracts : {};
  for (const [contractId, entry] of Object.entries(rawContracts)) {
    if (!entry || typeof entry !== "object") continue;
    const directRaw = entry.directCost;
    const directNum = directRaw == null ? null : Number(directRaw);
    const lineRates: Record<string, Record<string, number>> = {};
    const rawLines = entry.lineRates;
    if (rawLines && typeof rawLines === "object") {
      for (const [boqId, rates] of Object.entries(rawLines)) {
        if (!rates || typeof rates !== "object") continue;
        const clean: Record<string, number> = {};
        for (const [colId, value] of Object.entries(rates)) {
          if (!columnIds.has(colId)) continue;
          const n = Number(value);
          if (!Number.isFinite(n)) continue;
          clean[colId] = n;
        }
        if (Object.keys(clean).length) lineRates[boqId] = clean;
      }
    }
    contracts[contractId] = {
      directCost:
        directNum != null && Number.isFinite(directNum) ? directNum : null,
      lineRates,
    };
  }
  if (!columns.length && !Object.keys(contracts).length) return EMPTY_NEXUS_COSTS;
  return { columns, contracts };
}

function handoverLine(
  data: FlowhubData,
  contractId: string
): ScheduleLine | undefined {
  return handoverByContract(data.schedules).get(contractId);
}

/**
 * Same date reports and the retention clock already use:
 * handover end date, else start date. NA is not a date.
 */
export function handoverDateForContract(
  data: FlowhubData,
  contractId: string
): string | null {
  const line = handoverLine(data, contractId);
  const d = line?.endDate || line?.startDate || null;
  if (!d || isScheduleDateNa(d)) return null;
  return d.slice(0, 10);
}

/**
 * Handed over when the handover schedule is marked done, or its date is
 * today or earlier. No handover line means not handed over.
 */
export function contractIsHandedOver(
  data: FlowhubData,
  contractId: string,
  today: string
): boolean {
  const line = handoverLine(data, contractId);
  if (!line) return false;
  if (line.done) return true;
  const date = handoverDateForContract(data, contractId);
  return !!date && date <= today;
}

export function taxInvoiceNet(data: FlowhubData, contractId: string): number {
  let sum = 0;
  for (const invoice of workspaceIndex(data).tisByContract.get(contractId) ?? []) {
    sum += Number(invoice.netAmount) || 0;
  }
  return sum;
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

export function boqLineCost(
  line: Pick<BoqItem, "quantity">,
  columns: NexusCostColumn[],
  rates: Record<string, number> | undefined
): { lineRate: number; lineTotal: number; filled: boolean } {
  let lineRate = 0;
  let filled = false;
  for (const col of columns) {
    const v = rates?.[col.id];
    if (v == null || !Number.isFinite(v)) continue;
    filled = true;
    lineRate += v;
  }
  return {
    lineRate,
    lineTotal: lineRate * (Number(line.quantity) || 0),
    filled,
  };
}

export function contractUsesBoqCost(
  contract: Contract,
  costs: NexusCosts
): boolean {
  const entry = costs.contracts[contract.id];
  if (!entry) return false;
  return contract.boq.some(
    (line) => boqLineCost(line, costs.columns, entry.lineRates[line.id]).filled
  );
}

export function contractCostAmount(
  contract: Contract,
  costs: NexusCosts
): number {
  const entry = costs.contracts[contract.id];
  if (contractUsesBoqCost(contract, costs)) {
    return contract.boq.reduce((sum, line) => {
      return (
        sum +
        boqLineCost(line, costs.columns, entry?.lineRates[line.id]).lineTotal
      );
    }, 0);
  }
  const direct = entry?.directCost;
  return direct != null && Number.isFinite(direct) ? direct : 0;
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
 * Handover wins: a handed-over contract is Completed even before the
 * stored word is rewritten. On hold and Active apply only before that.
 */
export function contractDisplayStatus(
  data: FlowhubData,
  contract: Pick<Contract, "id" | "status">,
  today: string
): ContractStatusLabel {
  if (contractIsHandedOver(data, contract.id, today)) return "Completed";
  return contractStatusLabel(contract.status);
}

export type CostCentreRow = {
  contractId: string;
  projectName: string;
  projectNo: string;
  city: string;
  status: ContractStatusLabel;
  workOrder: number;
  contractCost: number;
  expenses: number;
  cumulative: number;
  comparison: number;
  profit: number;
  profitPercent: number | null;
  fromBoq: boolean;
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
      const contractCost = contractCostAmount(c, costs);
      const expenses = contractExpenseTotal(c);
      const cumulative = contractCost + expenses;
      const comparison = comparisonValue(data, c, today);
      const profit = comparison - cumulative;
      const profitPercent =
        Math.abs(comparison) < 0.005 ? null : (profit / comparison) * 100;
      return {
        contractId: c.id,
        projectName: c.projectName,
        projectNo: c.projectNo,
        city: c.city || "—",
        status: contractDisplayStatus(data, c, today),
        workOrder: Number(c.orderValue) || 0,
        contractCost,
        expenses,
        cumulative,
        comparison,
        profit,
        profitPercent,
        fromBoq: contractUsesBoqCost(c, costs),
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
