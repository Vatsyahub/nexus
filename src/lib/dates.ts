/** Hub display format: dd-mmm-yyyy (e.g. 12-Oct-2026). Storage stays YYYY-MM-DD. */

import { SCHEDULE_DATE_NA, isScheduleDateNa } from "@/lib/types";

const MONTHS = [
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
] as const;

/**
 * Format a calendar date or ISO timestamp for display.
 * Passes through NA; empty → em dash (or `empty`).
 */
export function formatDisplayDate(
  value: string | null | undefined,
  empty: string = "—"
): string {
  if (value == null) return empty;
  const raw = String(value).trim();
  if (!raw) return empty;
  if (isScheduleDateNa(raw)) return SCHEDULE_DATE_NA;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${String(day).padStart(2, "0")}-${MONTHS[month - 1]}-${year}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    return `${String(day).padStart(2, "0")}-${MONTHS[month - 1]}-${year}`;
  }

  return raw;
}

/** Date + local time for changelog / audit stamps. */
export function formatDisplayDateTime(
  value: string | null | undefined,
  empty: string = "—"
): string {
  if (value == null || !String(value).trim()) return empty;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return formatDisplayDate(value, empty);
  const date = formatDisplayDate(
    `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`
  );
  const time = parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}`;
}

/** Both ISO and display forms for search matching. */
export function dateSearchForms(
  value: string | null | undefined
): string[] {
  if (value == null || !String(value).trim()) return [];
  const raw = String(value).trim();
  const display = formatDisplayDate(raw, "");
  if (!display || display === "—") return [raw];
  if (display === raw) return [raw];
  return [raw, display];
}

/**
 * Inclusive YYYY-MM-DD range check for invoice/TI/PI dates.
 * Empty `from` / `to` means no bound on that side.
 */
export function isDateInInclusiveRange(
  date: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!from && !to) return true;
  const ymd = String(date ?? "")
    .trim()
    .slice(0, 10);
  if (from && (!ymd || ymd < from)) return false;
  if (to && (!ymd || ymd > to)) return false;
  return true;
}

/** Display helper for schedule dates (shows NA as-is, dates as dd-mmm-yyyy). */
export function formatScheduleDateRange(start: string, end: string): string {
  if (isScheduleDateNa(start) && isScheduleDateNa(end)) return SCHEDULE_DATE_NA;
  if (isScheduleDateNa(start)) return SCHEDULE_DATE_NA;
  if (isScheduleDateNa(end) || start === end) return formatDisplayDate(start);
  return `${formatDisplayDate(start)} → ${formatDisplayDate(end)}`;
}
