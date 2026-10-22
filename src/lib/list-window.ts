import { todayIso } from "@/lib/nexus-core";

/** How many rows an unfiltered list keeps. */
export const LIST_WINDOW_LIMIT = 100;

export const LATEST_LIST_NOTE = "Latest 100";
export const OLDEST_LIST_NOTE = "Oldest 100";

/**
 * Which open lists are capped, and in which direction.
 * Proformas are the only oldest-first list. A tab name is not a filter.
 */
export const LIST_WINDOW_ORDER = {
  billingInvoices: "latest",
  payments: "latest",
  expenses: "latest",
  outstandingAll: "latest",
  outstandingDue: "latest",
  proformas: "oldest",
  salesInvoices: "latest",
  collections: "latest",
  accountExpenses: "latest",
  dcRecords: "latest",
} as const;

export type ListWindowName = keyof typeof LIST_WINDOW_ORDER;
export type ListWindowOrder = (typeof LIST_WINDOW_ORDER)[ListWindowName];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export type ListWindow<T> = {
  /** Rows to show and to export. */
  rows: T[];
  /** True when the unfiltered list was cut to the limit. */
  capped: boolean;
};

/**
 * Unfiltered means no search text, no from/to dates, no contract, project,
 * or type filter, Show deleted off, and not the due-within-7 view.
 * The tab itself is not a filter.
 */
export function listIsFiltered(input: {
  search?: string;
  from?: string;
  to?: string;
  type?: string;
  contract?: string;
  project?: string;
  showDeleted?: boolean;
  dueWithin7?: boolean;
}): boolean {
  if (input.search?.trim()) return true;
  if (input.from?.trim()) return true;
  if (input.to?.trim()) return true;
  const type = input.type?.trim();
  if (type && type.toUpperCase() !== "ALL") return true;
  if (input.contract?.trim()) return true;
  if (input.project?.trim()) return true;
  if (input.showDeleted) return true;
  if (input.dueWithin7) return true;
  return false;
}

function dayKey(date: string): string {
  return String(date ?? "")
    .trim()
    .slice(0, 10);
}

/** True when `date` is a calendar day on or before today. */
export function listDateOnOrBeforeToday(date: string, today: string): boolean {
  const day = dayKey(date);
  if (!ISO_DAY.test(day)) return false;
  return day <= today;
}

/**
 * Unfiltered: dates on or before today, then the latest or oldest `limit`.
 * Fewer than `limit` qualifying rows are all returned.
 * Filtered: every row, in the order given (the screen's existing sort).
 * A cut is by row, so the last challan on DC records may be split.
 */
export function windowList<T>(
  rows: readonly T[],
  opts: {
    filtered: boolean;
    order: ListWindowOrder;
    date: (row: T) => string;
    /** Tie-break after the date. Newer createdAt wins on a latest list. */
    createdAt?: (row: T) => string | null | undefined;
    today?: string;
    limit?: number;
  }
): ListWindow<T> {
  if (opts.filtered) {
    return { rows: [...rows], capped: false };
  }
  const today = opts.today ?? todayIso();
  const limit = opts.limit ?? LIST_WINDOW_LIMIT;
  const qualifying = rows.filter((row) =>
    listDateOnOrBeforeToday(opts.date(row), today)
  );
  const newestFirst = opts.order === "latest";
  qualifying.sort((a, b) => {
    const byDate = newestFirst
      ? dayKey(opts.date(b)).localeCompare(dayKey(opts.date(a)))
      : dayKey(opts.date(a)).localeCompare(dayKey(opts.date(b)));
    if (byDate) return byDate;
    if (!opts.createdAt) return 0;
    const aCreated = opts.createdAt(a) ?? "";
    const bCreated = opts.createdAt(b) ?? "";
    return newestFirst
      ? bCreated.localeCompare(aCreated)
      : aCreated.localeCompare(bCreated);
  });
  const capped = qualifying.length > limit;
  return {
    rows: capped ? qualifying.slice(0, limit) : qualifying,
    capped,
  };
}

/** Note for a capped open list. Hidden when the list is not cut. */
export function listWindowNote(
  capped: boolean,
  order: ListWindowOrder
): typeof LATEST_LIST_NOTE | typeof OLDEST_LIST_NOTE | null {
  if (!capped) return null;
  return order === "oldest" ? OLDEST_LIST_NOTE : LATEST_LIST_NOTE;
}

/**
 * Header figure. Unfiltered uses the whole source. Filtered uses the rows
 * on screen. Also used for the open proforma count.
 */
export function wholeUntilFiltered<T>(
  whole: T,
  listed: T,
  filtered: boolean
): T {
  return filtered ? listed : whole;
}
