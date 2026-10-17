/**
 * One pass over a workspace snapshot, reused for every lookup in that render
 * or report. Keyed by object identity: a save replaces the snapshot, so the
 * next pass rebuilds. Callers must not mutate the arrays on a cached snapshot.
 */

import type {
  Contract,
  FlowhubData,
  InstallationProgress,
  Invoice,
  Payment,
  ScheduleLine,
  Task,
} from "@/lib/types";

export type WorkspaceIndex = {
  contractById: Map<string, Contract>;
  invoiceById: Map<string, Invoice>;
  /** Every invoice on the contract, in stored order. */
  invoicesByContract: Map<string, Invoice[]>;
  /** Tax invoices, oldest date then createdAt, matching contract reports. */
  tisByContract: Map<string, Invoice[]>;
  paymentsByInvoice: Map<string, Payment[]>;
  paymentsByContract: Map<string, Payment[]>;
  tasksByContract: Map<string, Task[]>;
  /** First installation-progress row for contract + BOQ item. */
  installationByItem: Map<string, InstallationProgress>;
  /** Sum of delivery-challan qty for contract + BOQ item. */
  suppliedByItem: Map<string, number>;
};

const cache = new WeakMap<FlowhubData, WorkspaceIndex>();
const handoverCache = new WeakMap<readonly ScheduleLine[], Map<string, ScheduleLine>>();
const EMPTY_HANDOVER = new Map<string, ScheduleLine>();

export function itemKey(contractId: string, boqItemId: string): string {
  return `${contractId}\0${boqItemId}`;
}

function push<T>(map: Map<string, T[]>, key: string, row: T) {
  const list = map.get(key);
  if (list) list.push(row);
  else map.set(key, [row]);
}

/** First handover line per contract. Same winner as `schedules.find`. */
export function handoverByContract(
  schedules: readonly ScheduleLine[] | null | undefined
): Map<string, ScheduleLine> {
  if (!schedules || schedules.length === 0) return EMPTY_HANDOVER;
  const hit = handoverCache.get(schedules);
  if (hit) return hit;
  const map = new Map<string, ScheduleLine>();
  for (const line of schedules) {
    if (line.kind !== "handover" || map.has(line.contractId)) continue;
    map.set(line.contractId, line);
  }
  handoverCache.set(schedules, map);
  return map;
}

export function workspaceIndex(data: FlowhubData): WorkspaceIndex {
  const hit = cache.get(data);
  if (hit) return hit;

  const contractById = new Map<string, Contract>();
  for (const contract of data.contracts ?? []) {
    if (!contractById.has(contract.id)) contractById.set(contract.id, contract);
  }

  const invoiceById = new Map<string, Invoice>();
  const invoicesByContract = new Map<string, Invoice[]>();
  const tisByContract = new Map<string, Invoice[]>();
  for (const invoice of data.invoices ?? []) {
    if (!invoiceById.has(invoice.id)) invoiceById.set(invoice.id, invoice);
    push(invoicesByContract, invoice.contractId, invoice);
    if (invoice.type === "TI") push(tisByContract, invoice.contractId, invoice);
  }
  for (const rows of tisByContract.values()) {
    rows.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
    );
  }

  const paymentsByInvoice = new Map<string, Payment[]>();
  const paymentsByContract = new Map<string, Payment[]>();
  for (const payment of data.payments ?? []) {
    push(paymentsByContract, payment.contractId, payment);
    if (payment.invoiceId) push(paymentsByInvoice, payment.invoiceId, payment);
  }

  const tasksByContract = new Map<string, Task[]>();
  for (const task of data.tasks ?? []) {
    if (task.contractId) push(tasksByContract, task.contractId, task);
  }

  const installationByItem = new Map<string, InstallationProgress>();
  for (const row of data.installationProgress ?? []) {
    const key = itemKey(row.contractId, row.boqItemId);
    if (!installationByItem.has(key)) installationByItem.set(key, row);
  }

  const suppliedByItem = new Map<string, number>();
  for (const challan of data.deliveryChallans ?? []) {
    for (const line of challan.lines ?? []) {
      const key = itemKey(challan.contractId, line.boqItemId);
      suppliedByItem.set(key, (suppliedByItem.get(key) ?? 0) + (Number(line.qty) || 0));
    }
  }

  const index: WorkspaceIndex = {
    contractById,
    invoiceById,
    invoicesByContract,
    tisByContract,
    paymentsByInvoice,
    paymentsByContract,
    tasksByContract,
    installationByItem,
    suppliedByItem,
  };
  cache.set(data, index);
  return index;
}
