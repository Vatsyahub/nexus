import assert from "node:assert/strict";
import test from "node:test";
import {
  SCHEDULE_CHANGE_LOG_TTL_MS,
  purgeExpiredScheduleChangeLog,
} from "@/lib/schedule-change-log";
import type { ScheduleChangeLogEntry } from "@/lib/types";

function row(id: string, at: string): ScheduleChangeLogEntry {
  return {
    id,
    at,
    by: "Tester",
    contractId: null,
    scheduleId: null,
    summary: id,
  };
}

test("schedule change log drops rows 14 days after their timestamp", () => {
  const now = Date.parse("2026-10-14T12:00:00.000Z");
  const kept = new Date(now - SCHEDULE_CHANGE_LOG_TTL_MS + 1000).toISOString();
  const exact = new Date(now - SCHEDULE_CHANGE_LOG_TTL_MS).toISOString();
  const old = new Date(now - SCHEDULE_CHANGE_LOG_TTL_MS - 1).toISOString();
  const next = purgeExpiredScheduleChangeLog(
    [
      row("new", kept),
      row("exact", exact),
      row("old", old),
      row("bad", "not-a-date"),
    ],
    now
  );
  assert.deepEqual(
    next.map((entry) => entry.id),
    ["new", "bad"]
  );
});
