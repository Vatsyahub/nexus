/**
 * Dispatch / Execution report builders — DCs, installation progress,
 * schedule fulfilment, BOQ summary, workorders, tasks, supply lines.
 */

import type { Contract, FlowhubData, ScheduleLine } from "@/lib/types";
import { isScheduleDateNa } from "@/lib/types";
import { formatDisplayDate, isDateInInclusiveRange } from "@/lib/dates";
import { matchesAny } from "@/lib/list-search";
import {
  contractDisplayStatus,
  handoverDateForContract,
  todayIso as coreTodayIso,
  type ContractStatusLabel,
} from "@/lib/nexus-core";
import { installedQty, suppliedQty, taskIsOpen } from "@/lib/store";

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function realDate(d: string | null | undefined): string | null {
  if (!d || isScheduleDateNa(d)) return null;
  return d;
}

function boqItemName(contract: Contract | undefined, boqItemId: string) {
  return contract?.boq.find((b) => b.id === boqItemId)?.name ?? "—";
}

export type ExecutionKind = "supply" | "installation";

export type ScheduleFulfilmentStatus =
  | "pending"
  | "partially_supplied"
  | "fully_supplied"
  | "partially_installed"
  | "installed";

export const SCHEDULE_FULFILMENT_LABELS: Record<ScheduleFulfilmentStatus, string> =
  {
    pending: "Pending",
    partially_supplied: "Partially supplied",
    fully_supplied: "Fully supplied",
    partially_installed: "Partially installed",
    installed: "Installed",
  };

export type ScheduleFulfilmentRow = {
  scheduleId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  city: string;
  boqItemId: string;
  itemName: string;
  unit: string;
  kind: ExecutionKind;
  /** Committed vs uncommitted, as on the Schedules list */
  committed: boolean;
  /** Supply start or install start; null when NA */
  date: string | null;
  plannedQty: number;
  /** Actual supplied/installed allocated to this window */
  actualQty: number;
  status: ScheduleFulfilmentStatus;
};

function fulfilmentStatus(
  kind: ExecutionKind,
  planned: number,
  actual: number
): ScheduleFulfilmentStatus {
  if (actual <= 0) return "pending";
  const full = planned <= 0 || actual >= planned - 1e-9;
  if (kind === "supply") return full ? "fully_supplied" : "partially_supplied";
  return full ? "installed" : "partially_installed";
}

function windowSortKey(s: ScheduleLine): string {
  return realDate(s.startDate) ?? realDate(s.endDate) ?? "9999-99-99";
}

/**
 * Actual qty fills schedule windows of the same item + type in date order,
 * each up to its planned qty; anything beyond the last window lands there.
 */
export function buildScheduleFulfilmentRows(
  data: FlowhubData
): ScheduleFulfilmentRow[] {
  const contracts = new Map(data.contracts.map((c) => [c.id, c]));
  const groups = new Map<string, ScheduleLine[]>();
  for (const s of data.schedules) {
    if (s.kind !== "supply" && s.kind !== "installation") continue;
    if (!s.boqItemId || !contracts.has(s.contractId)) continue;
    const key = `${s.contractId}|${s.boqItemId}|${s.kind}`;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const rows: ScheduleFulfilmentRow[] = [];
  for (const lines of groups.values()) {
    const first = lines[0];
    const contract = contracts.get(first.contractId)!;
    const boqItemId = first.boqItemId!;
    const kind = first.kind as ExecutionKind;
    const actual =
      kind === "supply"
        ? suppliedQty(contract.id, boqItemId, data)
        : installedQty(contract.id, boqItemId, data);
    const ordered = [...lines].sort(
      (a, b) =>
        windowSortKey(a).localeCompare(windowSortKey(b)) ||
        a.createdAt.localeCompare(b.createdAt)
    );
    let remaining = actual;
    const allocations = ordered.map((s) => {
      const planned = Math.max(0, Number(s.quantity) || 0);
      const take = Math.min(remaining, planned);
      remaining -= take;
      return take;
    });
    if (remaining > 1e-9 && allocations.length > 0) {
      allocations[allocations.length - 1] += remaining;
    }
    const item = contract.boq.find((b) => b.id === boqItemId);
    ordered.forEach((s, i) => {
      const planned = Math.max(0, Number(s.quantity) || 0);
      rows.push({
        scheduleId: s.id,
        contractId: contract.id,
        projectNo: contract.projectNo,
        projectName: contract.projectName,
        city: contract.city,
        boqItemId,
        itemName: item?.name ?? "—",
        unit: item?.unit ?? "",
        kind,
        committed: !!s.committed,
        date: realDate(s.startDate),
        plannedQty: planned,
        actualQty: allocations[i],
        status: fulfilmentStatus(kind, planned, allocations[i]),
      });
    });
  }

  return rows.sort(
    (a, b) =>
      (a.date ?? "9999-99-99").localeCompare(b.date ?? "9999-99-99") ||
      a.projectNo.localeCompare(b.projectNo) ||
      a.itemName.localeCompare(b.itemName) ||
      a.kind.localeCompare(b.kind)
  );
}

export type ExecutionSummaryRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Not shown or exported. */
  city: string;
  boqItemId: string;
  itemName: string;
  unit: string;
  boqQty: number;
  supplied: number;
  installed: number;
  /** BOQ − supplied */
  leftToSupply: number;
  /** Supplied − installed */
  leftToInstall: number;
  /** Supplied minus the billed supply quantity. Never negative. */
  unbilledSupplyQty: number;
  /** Installed minus the billed install quantity. Never negative. */
  unbilledInstallQty: number;
  /** On-screen project status. Summary search only. Not shown or exported. */
  projectStatus: ContractStatusLabel;
};

const SUPPLY_STAND_IN_TERMS = [
  "supply",
  "installation",
  "testing",
  "handover",
] as const;
const INSTALL_STAND_IN_TERMS = ["installation", "testing", "handover"] as const;

function termIsOpen(
  terms: Contract["billingTerms"] | null | undefined,
  key: string
): boolean {
  const percent = Number(terms?.[key]);
  return Number.isFinite(percent) && percent > 0;
}

function standInTerm(
  terms: Contract["billingTerms"] | null | undefined,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    if (termIsOpen(terms, key)) return key;
  }
  return null;
}

/** Tax-invoice qty by contract, BOQ line, and billing term. Proforma stays out. */
function taxInvoiceQtyByTerm(data: FlowhubData): Map<string, number> {
  const totals = new Map<string, number>();
  for (const invoice of data.invoices ?? []) {
    if (invoice?.type !== "TI" || !invoice.contractId) continue;
    for (const line of invoice.lines ?? []) {
      if (!line?.boqItemId || !line.termKey) continue;
      const qty = Number(line.billedQty);
      if (!Number.isFinite(qty)) continue;
      const key = `${invoice.contractId}\0${line.boqItemId}\0${line.termKey}`;
      totals.set(key, (totals.get(key) ?? 0) + qty);
    }
  }
  return totals;
}

function unbilledQty(actual: number, billed: number): number {
  return Math.max(0, actual - billed);
}

export function buildExecutionSummaryRows(
  data: FlowhubData,
  contractId?: string
): ExecutionSummaryRow[] {
  const billedByTerm = taxInvoiceQtyByTerm(data);
  const today = coreTodayIso();
  const rows: ExecutionSummaryRow[] = [];
  for (const c of data.contracts) {
    if (contractId && c.id !== contractId) continue;
    const supplyTerm = standInTerm(c.billingTerms, SUPPLY_STAND_IN_TERMS);
    const installTerm = standInTerm(c.billingTerms, INSTALL_STAND_IN_TERMS);
    for (const b of c.boq) {
      const boqQty = Number(b.quantity) || 0;
      const supplied = suppliedQty(c.id, b.id, data);
      const installed = installedQty(c.id, b.id, data);
      const billedFor = (term: string | null) =>
        term == null
          ? 0
          : (billedByTerm.get(`${c.id}\0${b.id}\0${term}`) ?? 0);
      rows.push({
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city ?? "",
        boqItemId: b.id,
        itemName: b.name,
        unit: b.unit,
        boqQty,
        supplied,
        installed,
        leftToSupply: Math.max(0, boqQty - supplied),
        leftToInstall: Math.max(0, supplied - installed),
        unbilledSupplyQty: unbilledQty(supplied, billedFor(supplyTerm)),
        unbilledInstallQty: unbilledQty(installed, billedFor(installTerm)),
        projectStatus: contractDisplayStatus(data, c, today),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.projectNo.localeCompare(b.projectNo) ||
      a.itemName.localeCompare(b.itemName)
  );
}

/** Excel / PDF columns for Operations → Summary, in on-sheet order. */
export const EXECUTION_SUMMARY_EXPORT_HEADERS = [
  "Project",
  "Project no.",
  "Item",
  "Unit",
  "BOQ qty",
  "Supplied",
  "Installed",
  "Left to supply",
  "Left for installation",
  "Unbilled Supply Qty",
  "Unbilled Install Qty",
] as const;

export function executionSummaryExportRow(
  row: ExecutionSummaryRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    row.itemName,
    row.unit,
    row.boqQty,
    row.supplied,
    row.installed,
    row.leftToSupply,
    row.leftToInstall,
    row.unbilledSupplyQty,
    row.unbilledInstallQty,
  ];
}

export function filterExecutionSummaryRows(
  rows: ExecutionSummaryRow[],
  q?: string
): ExecutionSummaryRow[] {
  const needle = (q ?? "").trim();
  if (!needle) return rows;
  return rows.filter((r) =>
    matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.itemName,
      r.unit,
      r.projectStatus,
    ])
  );
}

export type WorkorderStatus = "active" | "on_hold" | "completed";

export const WORKORDER_STATUS_LABELS: Record<WorkorderStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
};

export type WorkorderRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  city: string;
  woNo: string;
  woDate: string;
  woValue: number;
  status: WorkorderStatus;
  /** Contract handover date. A schedule handover line is not used. */
  handoverDate: string | null;
  /** Contract handover date + DLP months */
  dlpEndDate: string | null;
  amendmentCount: number;
  latestAmendmentNo: string | null;
  latestAmendmentDate: string | null;
};

function contractWorkorderStatus(
  data: FlowhubData,
  c: Contract
): WorkorderStatus {
  const label = contractDisplayStatus(data, c, coreTodayIso());
  if (label === "Completed") return "completed";
  if (label === "On hold") return "on_hold";
  return "active";
}

function handoverDate(data: FlowhubData, contractId: string): string | null {
  return handoverDateForContract(data, contractId);
}

export function buildWorkorderRows(data: FlowhubData): WorkorderRow[] {
  return data.contracts
    .map((c) => {
      const handover = handoverDate(data, c.id);
      const amendments = c.amendments ?? [];
      const latest = amendments[amendments.length - 1] ?? null;
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        city: c.city || "—",
        woNo: c.orderNos || "—",
        woDate: c.orderDate,
        woValue: Number(c.orderValue) || 0,
        status: contractWorkorderStatus(data, c),
        handoverDate: handover,
        dlpEndDate: handover ? addMonthsIso(handover, c.dlpMonths || 0) : null,
        amendmentCount: amendments.length,
        latestAmendmentNo: latest?.number ?? null,
        latestAmendmentDate: latest?.date || null,
      };
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
}

export type ProjectTaskRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  created: number;
  completed: number;
  open: number;
  overdue: number;
};

export function buildProjectTaskRows(data: FlowhubData): ProjectTaskRow[] {
  const today = todayIso();
  return data.contracts
    .map((c) => {
      const tasks = data.tasks.filter(
        (t) => t.contractId === c.id && !t.deletedAt
      );
      const open = tasks.filter(taskIsOpen);
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        created: tasks.length,
        completed: tasks.filter((t) => t.status === "completed").length,
        open: open.length,
        overdue: open.filter((t) => !!t.dueDate && t.dueDate < today).length,
      };
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
}

export type SupplyDetailRow = {
  key: string;
  dcId: string;
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Contract city. Empty when the contract is missing. Not shown or exported. */
  city: string;
  dcNo: string;
  dcDate: string;
  boqItemId: string;
  itemName: string;
  qty: number;
};

export function buildSupplyDetailRows(
  data: FlowhubData,
  contractId?: string
): SupplyDetailRow[] {
  const contracts = new Map(data.contracts.map((c) => [c.id, c]));
  const rows: SupplyDetailRow[] = [];
  for (const dc of data.deliveryChallans) {
    if (contractId && dc.contractId !== contractId) continue;
    const contract = contracts.get(dc.contractId);
    dc.lines.forEach((l, i) => {
      rows.push({
        key: `${dc.id}-${i}`,
        dcId: dc.id,
        contractId: dc.contractId,
        projectNo: contract?.projectNo ?? "—",
        projectName: contract?.projectName ?? "Deleted contract",
        city: contract?.city ?? "",
        dcNo: dc.dcNo,
        dcDate: dc.date,
        boqItemId: l.boqItemId,
        itemName: boqItemName(contract, l.boqItemId),
        qty: l.qty,
      });
    });
  }
  return rows.sort(
    (a, b) =>
      b.dcDate.localeCompare(a.dcDate) ||
      a.projectNo.localeCompare(b.projectNo) ||
      a.dcNo.localeCompare(b.dcNo)
  );
}

/** Excel / PDF columns for Operations → DC records. City stays off this sheet. */
export const DC_RECORDS_EXPORT_HEADERS = [
  "Project",
  "Project no.",
  "DC no.",
  "DC date",
  "Item",
  "Qty supplied",
] as const;

export function supplyDetailExportRow(
  row: SupplyDetailRow
): (string | number)[] {
  return [
    row.projectName,
    row.projectNo,
    row.dcNo,
    formatDisplayDate(row.dcDate),
    row.itemName,
    row.qty,
  ];
}

/** DC date is inclusive. Text search is AND with that range. */
export function filterSupplyDetailRows(
  rows: SupplyDetailRow[],
  opts?: { q?: string; dateFrom?: string; dateTo?: string }
): SupplyDetailRow[] {
  const needle = (opts?.q ?? "").trim();
  const dateFrom = opts?.dateFrom ?? "";
  const dateTo = opts?.dateTo ?? "";
  return rows.filter((r) => {
    if (!isDateInInclusiveRange(r.dcDate, dateFrom, dateTo)) return false;
    return matchesAny(needle, [
      r.projectNo,
      r.projectName,
      r.city,
      r.dcNo,
      r.dcDate,
      formatDisplayDate(r.dcDate),
      r.itemName,
      r.qty,
    ]);
  });
}

export function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n)
    ? n.toLocaleString("en-IN")
    : n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/**
 * Active-contract figures for one city that has this item.
 * The Item list city column shows `leftForSupply` only.
 */
export type ItemListCityFigures = {
  /** Kept so left can be checked against the city's BOQ. Not shown. */
  boqQty: number;
  /**
   * City BOQ qty minus delivery-challan qty on those same BOQ lines.
   * Stays negative when challans exceed that city's BOQ. Not clamped.
   */
  leftForSupply: number;
};

export type ItemListRow = {
  /** Trimmed, lowercased item name */
  key: string;
  itemName: string;
  /**
   * Present only when the item is on an Active contract in that city.
   * A missing city means render blank, not 0. Zero and negative left stay
   * when the item is in the city.
   */
  byCity: Record<string, ItemListCityFigures>;
  /**
   * BOQ quantity of Active contracts only, including blank-city lines.
   * Shown as Total BOQ qty, and used for overall left.
   */
  totalQty: number;
  /**
   * Delivery-challan qty already recorded against those BOQ lines
   * (`suppliedQty`: sum of `deliveryChallans[].lines[].qty`).
   */
  totalSupplied: number;
  /** Active-contract BOQ qty minus total supplied. Negative when supply exceeds BOQ. */
  leftForSupply: number;
};

export type ItemListExportCell = string | number;

/**
 * Left for supply in one city, as a number. Empty when the item is not on an
 * Active contract in that city, so a missing city does not export as 0.
 * Zero and negative stay when the item is in the city.
 */
export function formatItemListCityCell(
  figures: ItemListCityFigures | undefined
): ItemListExportCell {
  if (!figures) return "";
  return figures.leftForSupply;
}

/**
 * Item name, overall BOQ, supplied, pending for supply, then one column
 * per city. City cells stay the quantity left for supply in that city.
 */
export function itemListHeaders(cities: string[]): string[] {
  return [
    "Item name",
    "Total BOQ qty",
    "Total supplied",
    "Pending for supply",
    ...cities,
  ];
}

export function itemListExportRow(
  cities: string[],
  row: ItemListRow
): ItemListExportCell[] {
  return [
    row.itemName,
    row.totalQty,
    row.totalSupplied,
    row.leftForSupply,
    ...cities.map((city) => formatItemListCityCell(row.byCity[city])),
  ];
}

function contractCity(city: string | null | undefined): string {
  return String(city ?? "").trim();
}

/** Active only. On hold and Completed (including handover) drop out. */
function contractIsActive(data: FlowhubData, contract: Contract): boolean {
  return contractDisplayStatus(data, contract, coreTodayIso()) === "Active";
}

/**
 * Cities that appear on at least one Active contract, trimmed, blank names
 * omitted, alphabetical. On hold, Completed, and any other non-Active
 * contract do not create a column. A contract with an empty city does not
 * create a column.
 */
export function itemListCities(data: FlowhubData): string[] {
  const set = new Set<string>();
  for (const contract of data.contracts) {
    if (!contractIsActive(data, contract)) continue;
    const city = contractCity(contract.city);
    if (city) set.add(city);
  }
  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

/**
 * BOQ lines grouped by item name across Active contracts only.
 * Status is the Cost centre label: On hold and Completed (and any other
 * non-Active label) are left out of city columns, the BOQ total, and supply.
 * Names match after trim and a case-insensitive compare. Quantities add
 * even when the unit differs, including into the city of the contract.
 * Blank names are skipped. An Active contract with no BOQ contributes its
 * city column only. Lines on an Active contract with a blank city count in
 * the totals and in no city column.
 * Total supplied sums delivery-challan qty on those same BOQ lines.
 * Pending for supply is that BOQ total minus supplied, and stays negative when
 * the challans exceed the ordered quantity. Blank-city lines stay in both.
 * A city's left is that city's Active-contract BOQ qty minus delivery-challan
 * qty on those same lines, and is the only figure the city column shows.
 * On hold and Completed challans stay out. A city with no Active line for
 * the item is omitted, so the cell stays blank rather than 0.
 */
export function buildItemListRows(data: FlowhubData): ItemListRow[] {
  type CityAcc = { boqQty: number; supplied: number };
  type Acc = {
    itemName: string;
    totalQty: number;
    totalSupplied: number;
    byCity: Record<string, CityAcc>;
  };
  const groups = new Map<string, Acc>();

  for (const contract of data.contracts) {
    if (!contractIsActive(data, contract)) continue;
    const lines = contract.boq ?? [];
    if (lines.length === 0) continue;
    const city = contractCity(contract.city);
    for (const line of lines) {
      const itemName = String(line?.name ?? "").trim();
      if (!itemName) continue;
      const key = itemName.toLowerCase();
      let acc = groups.get(key);
      if (!acc) {
        acc = { itemName, totalQty: 0, totalSupplied: 0, byCity: {} };
        groups.set(key, acc);
      }
      const raw = Number(line.quantity);
      const qty = Number.isFinite(raw) ? raw : 0;
      const supplied = suppliedQty(contract.id, line.id, data);
      acc.totalQty += qty;
      acc.totalSupplied += supplied;
      if (city) {
        const cell = acc.byCity[city] ?? { boqQty: 0, supplied: 0 };
        cell.boqQty += qty;
        cell.supplied += supplied;
        acc.byCity[city] = cell;
      }
    }
  }

  return [...groups.values()]
    .map((acc) => {
      const byCity: Record<string, ItemListCityFigures> = {};
      for (const [city, cell] of Object.entries(acc.byCity)) {
        byCity[city] = {
          boqQty: cell.boqQty,
          leftForSupply: cell.boqQty - cell.supplied,
        };
      }
      return {
        key: acc.itemName.trim().toLowerCase(),
        itemName: acc.itemName,
        byCity,
        totalQty: acc.totalQty,
        totalSupplied: acc.totalSupplied,
        leftForSupply: acc.totalQty - acc.totalSupplied,
      };
    })
    .sort((a, b) =>
      a.itemName.localeCompare(b.itemName, undefined, { sensitivity: "base" })
    );
}
