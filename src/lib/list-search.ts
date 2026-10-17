import type {
  Contract,
  Invoice,
  Payment,
  ScheduleKind,
  ScheduleLine,
  Task,
} from "@/lib/types";
import {
  SCHEDULE_DATE_NA,
  SCHEDULE_KIND_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  isScheduleDateNa,
} from "@/lib/types";
import { dateSearchForms } from "@/lib/dates";
import { contractShownStatus, todayIso } from "@/lib/nexus-core";

/** Split a list-search query into AND tokens (comma-separated chips). */
export function parseSearchTokens(query: string): string[] {
  return query
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizedTokens(query: string): string[] {
  return parseSearchTokens(query).map((t) => t.toLowerCase());
}

/** Join tokens for ListSearchBar controlled value. */
export function formatSearchQuery(tokens: string[]): string {
  return tokens
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
}

function fieldHaystack(
  fields: Array<string | number | boolean | null | undefined>
): string[] {
  return fields
    .filter((f) => f != null && f !== "")
    .map((f) => String(f).toLowerCase());
}

/** True when a single token matches any field (case-insensitive substring). */
export function matchesToken(
  token: string,
  fields: Array<string | number | boolean | null | undefined>
): boolean {
  const needle = token.trim().toLowerCase();
  if (!needle) return true;
  return fieldHaystack(fields).some((f) => f.includes(needle));
}

/**
 * Whole-word match for commitment status.
 * "committed" does not match the letters inside "uncommitted".
 * Any other token returns null and keeps ordinary substring search.
 */
function commitmentWordMatch(
  token: string,
  committed: boolean
): boolean | null {
  const word = token.trim().toLowerCase();
  if (word !== "committed" && word !== "uncommitted") return null;
  return (committed ? "committed" : "uncommitted") === word;
}

/**
 * AND substring search, with committed / uncommitted matched as whole words.
 * Used by the Operations Schedules report.
 */
export function matchesAnyRespectingCommitment(
  query: string,
  committed: boolean,
  fields: Array<string | number | boolean | null | undefined>
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  const hay = fieldHaystack(fields);
  return tokens.every((token) => {
    const commitment = commitmentWordMatch(token, committed);
    if (commitment !== null) return commitment;
    return hay.some((f) => f.includes(token));
  });
}

/**
 * True when query is empty or every token matches some field (AND).
 * Tokens are comma-separated (ListSearchBar chips); each may hit a different field.
 */
export function matchesAny(
  query: string,
  fields: Array<string | number | boolean | null | undefined>
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  const hay = fieldHaystack(fields);
  return tokens.every((token) => hay.some((f) => f.includes(token)));
}

function contractFieldList(
  contract: Pick<
    Contract,
    | "projectNo"
    | "projectName"
    | "orderNos"
    | "orderDate"
    | "closureDate"
    | "orderValue"
    | "city"
    | "state"
    | "country"
    | "contractorAssigned"
    | "handoverDate"
    | "status"
    | "abgNumber"
    | "pbgNumber"
    | "abgDate"
    | "pbgDate"
    | "abgExpiry"
    | "pbgExpiry"
    | "boq"
  >
): Array<string | number | boolean | null | undefined> {
  return [
    contract.projectNo,
    contract.projectName,
    contract.orderNos,
    ...dateSearchForms(contract.orderDate),
    ...dateSearchForms(contract.closureDate),
    contract.orderValue,
    contract.city,
    contract.state,
    contract.country,
    contract.contractorAssigned,
    contractShownStatus(
      {
        status: contract.status,
        handoverDate: contract.handoverDate ?? null,
      },
      todayIso()
    ),
    ...dateSearchForms(contract.handoverDate),
    contract.abgNumber,
    contract.pbgNumber,
    ...dateSearchForms(contract.abgDate),
    ...dateSearchForms(contract.pbgDate),
    ...dateSearchForms(contract.abgExpiry),
    ...dateSearchForms(contract.pbgExpiry),
    ...contract.boq.map((b) => b.name),
  ];
}

/** Match project, location, order, dates, guarantees, BOQ names, status, value. */
export function contractMatchesQuery(
  contract: Parameters<typeof contractFieldList>[0],
  query: string
): boolean {
  return matchesAny(query, contractFieldList(contract));
}

/**
 * Contract ids that match the query. Empty query → null (no restriction).
 */
export function matchingContractIds(
  contracts: Array<
    Parameters<typeof contractFieldList>[0] & { id: string }
  >,
  query: string
): Set<string> | null {
  if (!normalizedTokens(query).length) return null;
  return new Set(
    contracts.filter((c) => contractMatchesQuery(c, query)).map((c) => c.id)
  );
}

const INVOICE_TYPE_ALIASES: Record<Invoice["type"], string[]> = {
  PI: ["pi", "proforma", "performa", "proforma invoice"],
  TI: ["ti", "tax", "tax invoice", "invoice"],
};

function invoiceMatchesToken(
  invoice: Pick<
    Invoice,
    | "type"
    | "number"
    | "date"
    | "netAmount"
    | "gstAmount"
    | "finalAmount"
    | "contractId"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  token: string,
  extras?: { dueDate?: string | null }
): boolean {
  const typeHit = INVOICE_TYPE_ALIASES[invoice.type].some((a) =>
    a.includes(token)
  );
  return (
    typeHit ||
    matchesToken(token, [
      invoice.type,
      invoice.number,
      `${invoice.type} ${invoice.number}`,
      ...dateSearchForms(invoice.date),
      ...dateSearchForms(extras?.dueDate),
      invoice.netAmount,
      invoice.gstAmount,
      invoice.finalAmount,
    ]) ||
    (!!contract && matchesToken(token, contractFieldList(contract)))
  );
}

export function invoiceMatchesQuery(
  invoice: Pick<
    Invoice,
    | "type"
    | "number"
    | "date"
    | "netAmount"
    | "gstAmount"
    | "finalAmount"
    | "contractId"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  query: string,
  extras?: { dueDate?: string | null }
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  return tokens.every((token) =>
    invoiceMatchesToken(invoice, contract, token, extras)
  );
}

function paymentMatchesToken(
  payment: Pick<
    Payment,
    | "date"
    | "netAmount"
    | "gstAmount"
    | "retentionAmount"
    | "tdsAmount"
    | "otherDeductions"
    | "otherDeductionReason"
    | "link"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  invoice:
    | Pick<Invoice, "type" | "number" | "date" | "finalAmount">
    | null
    | undefined,
  token: string
): boolean {
  const linkHit =
    payment.link.toLowerCase().includes(token) ||
    (payment.link === "unlinked" && "unlinked".includes(token));
  return (
    linkHit ||
    matchesToken(token, [
      ...dateSearchForms(payment.date),
      payment.netAmount,
      payment.gstAmount,
      payment.retentionAmount,
      payment.tdsAmount,
      payment.otherDeductions,
      payment.otherDeductionReason,
      payment.netAmount + payment.gstAmount,
    ]) ||
    (!!invoice &&
      matchesToken(token, [
        invoice.type,
        invoice.number,
        `${invoice.type} ${invoice.number}`,
        ...dateSearchForms(invoice.date),
        invoice.finalAmount,
      ])) ||
    (!!contract && matchesToken(token, contractFieldList(contract)))
  );
}

export function paymentMatchesQuery(
  payment: Pick<
    Payment,
    | "date"
    | "netAmount"
    | "gstAmount"
    | "retentionAmount"
    | "tdsAmount"
    | "otherDeductions"
    | "otherDeductionReason"
    | "link"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  invoice:
    | Pick<Invoice, "type" | "number" | "date" | "finalAmount">
    | null
    | undefined,
  query: string
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  return tokens.every((token) =>
    paymentMatchesToken(payment, contract, invoice, token)
  );
}

function taskMatchesToken(
  task: Pick<
    Task,
    | "title"
    | "department"
    | "assignees"
    | "status"
    | "priority"
    | "dueDate"
    | "notes"
    | "completedAt"
    | "source"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  token: string
): boolean {
  return (
    matchesToken(token, [
      task.title,
      task.department,
      ...task.assignees,
      task.status,
      TASK_STATUS_LABELS[task.status],
      task.priority,
      TASK_PRIORITY_LABELS[task.priority],
      ...dateSearchForms(task.dueDate),
      task.notes,
      ...dateSearchForms(task.completedAt),
      task.source,
    ]) ||
    (!!contract && matchesToken(token, contractFieldList(contract)))
  );
}

export function taskMatchesQuery(
  task: Pick<
    Task,
    | "title"
    | "department"
    | "assignees"
    | "status"
    | "priority"
    | "dueDate"
    | "notes"
    | "completedAt"
    | "source"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  query: string
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  return tokens.every((token) => taskMatchesToken(task, contract, token));
}

function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function scheduleMatchesToken(
  line: Pick<
    ScheduleLine,
    | "kind"
    | "quantity"
    | "startDate"
    | "endDate"
    | "committed"
    | "done"
    | "doneAt"
    | "doneBy"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  itemName: string | null | undefined,
  token: string
): boolean {
  const commitment = commitmentWordMatch(token, !!line.committed);
  if (commitment !== null) return commitment;
  const kind = line.kind as ScheduleKind;
  const kindLabel = SCHEDULE_KIND_LABELS[kind];
  const due = line.endDate || line.startDate;
  const overdue =
    !line.done &&
    !!due &&
    !isScheduleDateNa(due) &&
    due < todayIsoLocal();
  const statusBits = [
    line.done ? "done" : "planned",
    line.committed ? "committed" : "uncommitted",
    isScheduleDateNa(line.startDate) ? SCHEDULE_DATE_NA : null,
    overdue ? "overdue" : null,
  ];
  return (
    matchesToken(token, [
      kind,
      kindLabel,
      itemName,
      line.quantity,
      ...dateSearchForms(line.startDate),
      ...dateSearchForms(line.endDate),
      ...dateSearchForms(line.doneAt),
      line.doneBy,
      ...statusBits,
    ]) ||
    (!!contract && matchesToken(token, contractFieldList(contract)))
  );
}

export function scheduleMatchesQuery(
  line: Pick<
    ScheduleLine,
    | "kind"
    | "quantity"
    | "startDate"
    | "endDate"
    | "committed"
    | "done"
    | "doneAt"
    | "doneBy"
  >,
  contract:
    | Parameters<typeof contractFieldList>[0]
    | null
    | undefined,
  itemName: string | null | undefined,
  query: string
): boolean {
  const tokens = normalizedTokens(query);
  if (!tokens.length) return true;
  return tokens.every((token) =>
    scheduleMatchesToken(line, contract, itemName, token)
  );
}
