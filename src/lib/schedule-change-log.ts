import type { ScheduleChangeLogEntry } from "@/lib/types";

/** A change-log row is removed this long after its own timestamp. */
export const SCHEDULE_CHANGE_LOG_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function scheduleChangeLogExpired(
  at: string | null | undefined,
  nowMs: number
): boolean {
  if (!at) return false;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return false;
  return nowMs - t >= SCHEDULE_CHANGE_LOG_TTL_MS;
}

/** Drop rows that are 14 days old or older. Newer rows stay. */
export function purgeExpiredScheduleChangeLog(
  entries: ScheduleChangeLogEntry[] | null | undefined,
  nowMs = Date.now()
): ScheduleChangeLogEntry[] {
  return (entries ?? []).filter(
    (entry) => !scheduleChangeLogExpired(entry.at, nowMs)
  );
}
