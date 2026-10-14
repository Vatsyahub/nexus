import {
  NOTIFICATION_TTL_HOURS,
  NOTIFICATION_UNREAD_TTL_DAYS,
  type HubNotification,
} from "@/lib/types";
import { notificationVisibleTo, type NoticeViewer } from "@/lib/task-notices";

export const NOTIFICATION_TTL_MS = NOTIFICATION_TTL_HOURS * 60 * 60 * 1000;
export const NOTIFICATION_UNREAD_TTL_MS =
  NOTIFICATION_UNREAD_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Someone who might be a notice recipient. Used to retire department rows. */
export type NoticeAudienceMember = NoticeViewer & { id: string };

function readAtForUser(
  n: HubNotification,
  userId: string
): string | null {
  const fromMap = n.readAtByUserIds?.[userId];
  if (fromMap) return fromMap;
  // Legacy rows only stored readByUserIds — treat read time as createdAt.
  if (n.readByUserIds?.includes(userId)) return n.createdAt;
  return null;
}

function readAts(n: HubNotification): string[] {
  const map = n.readAtByUserIds ?? {};
  const fromMap = Object.values(map).filter(Boolean);
  if (fromMap.length) return fromMap;
  // Legacy: one synthetic read time per reader.
  if ((n.readByUserIds ?? []).length) {
    return n.readByUserIds.map(() => n.createdAt);
  }
  return [];
}

function ageMs(iso: string, nowMs: number): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return nowMs - t;
}

/** Open for 24 hours after the read time. */
function readWindowOpen(iso: string, nowMs: number): boolean {
  const age = ageMs(iso, nowMs);
  return age != null && age < NOTIFICATION_TTL_MS;
}

/** Open for 21 days after the notice was created. */
function unreadWindowOpen(n: HubNotification, nowMs: number): boolean {
  const age = ageMs(n.createdAt, nowMs);
  if (age == null) return false;
  return age < NOTIFICATION_UNREAD_TTL_MS;
}

/** Normalize optional legacy field. */
export function normalizeNotification(
  n: HubNotification
): HubNotification {
  return {
    ...n,
    readByUserIds: n.readByUserIds ?? [],
    readAtByUserIds: n.readAtByUserIds ?? {},
  };
}

/**
 * Whether this user should still see the notification.
 * Unread → 21 days from createdAt. Read → 24 hours from their read time.
 */
export function notificationVisibleForUser(
  n: HubNotification,
  userId: string,
  nowMs = Date.now()
): boolean {
  const readAt = readAtForUser(n, userId);
  if (readAt) return readWindowOpen(readAt, nowMs);
  return unreadWindowOpen(n, nowMs);
}

function anyReadWindowOpen(n: HubNotification, nowMs: number): boolean {
  return readAts(n).some((iso) => readWindowOpen(iso, nowMs));
}

/**
 * Hard-delete when no recipient should still see the row.
 * - Unread: 21 days from createdAt, then gone.
 * - Read: 24 hours from that person's read, then gone for them.
 * - Department (and any shared row): keep it while any recipient's case
 *   is still open. When every case is spent, remove it entirely.
 * No archive.
 */
export function notificationShouldRetain(
  n: HubNotification,
  nowMs = Date.now(),
  members?: NoticeAudienceMember[]
): boolean {
  // A reader still inside their 24-hour window keeps the row, even if
  // other people have already aged out.
  if (anyReadWindowOpen(n, nowMs)) return true;

  const unreadOpen = unreadWindowOpen(n, nowMs);
  if (!unreadOpen) return false;

  if (members) {
    const audience = members.filter((m) => notificationVisibleTo(n, m));
    if (audience.length > 0) {
      return audience.some((m) => {
        const readAt = readAtForUser(n, m.id);
        if (readAt) return readWindowOpen(readAt, nowMs);
        return true;
      });
    }
    // No matching account. A recorded read whose window has closed
    // must not keep the row. An unread notice still lasts 21 days.
    if (readAts(n).length > 0 || (n.readByUserIds ?? []).length > 0) {
      return false;
    }
    return true;
  }

  const names = (n.audienceUserNames ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const readers = n.readByUserIds ?? [];
  const reads = readAts(n);
  const department = (n.audienceDepartment ?? "").trim();
  const masterOnly = n.audienceClearance === "master";

  // Named people only: once each named person has read and that read is
  // older than 24 hours, nothing remains.
  if (names.length > 0 && !department && !masterOnly) {
    if (readers.length >= names.length && reads.length > 0) return false;
    return true;
  }

  // A notice someone has read, with no shared audience left to wait on.
  if (reads.length > 0 && names.length === 0 && !department && !masterOnly) {
    return false;
  }

  // Department or master audience, without a member list: an unread
  // person may still need it until day 21. Callers that know the
  // members pass them in and drop the row as soon as every case is spent.
  return true;
}

/**
 * Drop rows that are fully spent. No archive — removed entries leave
 * the array permanently.
 */
export function purgeExpiredNotifications(
  notifications: HubNotification[] | null | undefined,
  nowMs = Date.now(),
  members?: NoticeAudienceMember[]
): HubNotification[] {
  return (notifications ?? [])
    .map(normalizeNotification)
    .filter((n) => notificationShouldRetain(n, nowMs, members));
}

/** @deprecated use notificationVisibleForUser — kept for store re-exports */
export function notificationIsAlive(
  n: HubNotification,
  nowMs = Date.now()
): boolean {
  return notificationShouldRetain(n, nowMs);
}
