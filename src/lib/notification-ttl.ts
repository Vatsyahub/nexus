import {
  NOTIFICATION_TTL_HOURS,
  NOTIFICATION_UNREAD_TTL_DAYS,
  type ClearedNotices,
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
    clearedByUserIds: n.clearedByUserIds ?? [],
  };
}

function clearedByUser(n: HubNotification, userId: string): boolean {
  return (n.clearedByUserIds ?? []).includes(userId);
}

function wasReadBy(n: HubNotification, userId: string): boolean {
  return (
    (n.readByUserIds ?? []).includes(userId) ||
    Boolean(n.readAtByUserIds?.[userId])
  );
}

/**
 * Whether this user should still see the notification.
 * Unread → 21 days from createdAt. Read → 24 hours from their read time.
 * Cleared → gone for that person, including inside the 24 hour window.
 */
export function notificationVisibleForUser(
  n: HubNotification,
  userId: string,
  nowMs = Date.now()
): boolean {
  if (clearedByUser(n, userId)) return false;
  const readAt = readAtForUser(n, userId);
  if (readAt) return readWindowOpen(readAt, nowMs);
  return unreadWindowOpen(n, nowMs);
}

/**
 * A cleared person's open read window does not keep the shared row.
 * Anyone else still inside their 24 hours does.
 */
function anyReadWindowOpen(n: HubNotification, nowMs: number): boolean {
  const map = n.readAtByUserIds ?? {};
  const entries = Object.entries(map).filter(([, iso]) => Boolean(iso));
  if (entries.length) {
    return entries.some(
      ([userId, iso]) => !clearedByUser(n, userId) && readWindowOpen(iso, nowMs)
    );
  }
  return (n.readByUserIds ?? []).some(
    (userId) => !clearedByUser(n, userId) && readWindowOpen(n.createdAt, nowMs)
  );
}

/**
 * Hard-delete when no recipient should still see the row.
 * - Unread: 21 days from createdAt, then gone.
 * - Read: 24 hours from that person's read, then gone for them.
 * - Department (and any shared row): keep it while any recipient's case
 *   is still open. Someone who cleared it does not keep the row.
 *   When every case is spent, remove it entirely.
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
        if (clearedByUser(n, m.id)) return false;
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

export function pruneClearedNotices(
  clearedNotices: ClearedNotices | null | undefined,
  nowMs = Date.now()
): ClearedNotices {
  const source = clearedNotices ?? {};
  let dropped = false;
  const next: ClearedNotices = {};
  for (const [noticeId, byUser] of Object.entries(source)) {
    const kept: Record<string, string> = {};
    for (const [userId, at] of Object.entries(byUser ?? {})) {
      const age = ageMs(at, nowMs);
      if (!at || age == null || age >= NOTIFICATION_UNREAD_TTL_MS) {
        dropped = true;
        continue;
      }
      kept[userId] = at;
    }
    if (Object.keys(kept).length === 0) {
      if (Object.keys(byUser ?? {}).length > 0) dropped = true;
      continue;
    }
    next[noticeId] = kept;
  }
  if (!dropped) return source;
  return next;
}

/** Union clears. A later save cannot drop someone who already cleared. */
export function mergeClearedNotices(
  current: ClearedNotices | null | undefined,
  incoming: ClearedNotices | null | undefined
): ClearedNotices {
  const out: ClearedNotices = {};
  for (const source of [current, incoming]) {
    for (const [noticeId, byUser] of Object.entries(source ?? {})) {
      const dest = (out[noticeId] ??= {});
      for (const [userId, at] of Object.entries(byUser ?? {})) {
        if (!at) continue;
        const prev = dest[userId];
        if (!prev || at < prev) dest[userId] = at;
      }
    }
  }
  return out;
}

/** Copy ledger clears onto the shared rows. Does not remove rows. */
export function stampClearedNotices(
  notifications: HubNotification[] | null | undefined,
  clearedNotices: ClearedNotices | null | undefined
): HubNotification[] {
  const ledger = clearedNotices ?? {};
  return (notifications ?? []).map((n) => {
    const extra = Object.keys(ledger[n.id] ?? {});
    if (extra.length === 0) return n;
    const ids = new Set([...(n.clearedByUserIds ?? []), ...extra]);
    if (ids.size === (n.clearedByUserIds ?? []).length) return n;
    return { ...n, clearedByUserIds: [...ids] };
  });
}

/** Keep clears already stored when an incoming copy of the row omitted them. */
export function unionNotificationClears(
  current: HubNotification[] | null | undefined,
  incoming: HubNotification[] | null | undefined
): HubNotification[] {
  const prev = new Map((current ?? []).map((n) => [n.id, n]));
  return (incoming ?? []).map((n) => {
    const old = prev.get(n.id);
    const ids = new Set([
      ...(old?.clearedByUserIds ?? []),
      ...(n.clearedByUserIds ?? []),
    ]);
    if (ids.size === (n.clearedByUserIds ?? []).length) return n;
    return { ...n, clearedByUserIds: [...ids] };
  });
}

/**
 * Drop clears a save tries to add for anyone except the signed-in person.
 * Clears already stored stay, including after the shared row is rewritten.
 */
export function restrictNewClearsToUser(
  currentNotifications: HubNotification[] | null | undefined,
  nextNotifications: HubNotification[] | null | undefined,
  currentLedger: ClearedNotices | null | undefined,
  nextLedger: ClearedNotices | null | undefined,
  userId: string
): { notifications: HubNotification[]; clearedNotices: ClearedNotices } {
  const prevLedger = currentLedger ?? {};
  const prevById = new Map(
    (currentNotifications ?? []).map((n) => [n.id, n])
  );
  const notifications = (nextNotifications ?? []).map((n) => {
    const prev = new Set([
      ...(prevById.get(n.id)?.clearedByUserIds ?? []),
      ...Object.keys(prevLedger[n.id] ?? {}),
    ]);
    const allowed: string[] = [];
    const seen = new Set<string>();
    for (const id of [...(n.clearedByUserIds ?? []), ...prev]) {
      if (seen.has(id)) continue;
      if (id !== userId && !prev.has(id)) continue;
      seen.add(id);
      allowed.push(id);
    }
    const currentIds = n.clearedByUserIds ?? [];
    const same =
      allowed.length === currentIds.length &&
      allowed.every((id) => currentIds.includes(id));
    if (same) return n;
    return { ...n, clearedByUserIds: allowed };
  });

  const clearedNotices: ClearedNotices = {};
  const noticeIds = new Set([
    ...Object.keys(prevLedger),
    ...Object.keys(nextLedger ?? {}),
  ]);
  for (const noticeId of noticeIds) {
    const prevUsers = prevLedger[noticeId] ?? {};
    const nextUsers = (nextLedger ?? {})[noticeId] ?? {};
    const merged: Record<string, string> = {};
    for (const [id, at] of Object.entries(prevUsers)) {
      if (at) merged[id] = at;
    }
    for (const [id, at] of Object.entries(nextUsers)) {
      if (!at) continue;
      if (id !== userId && !prevUsers[id]) continue;
      const prev = merged[id];
      if (!prev || at < prev) merged[id] = at;
    }
    if (Object.keys(merged).length > 0) clearedNotices[noticeId] = merged;
  }
  return { notifications, clearedNotices };
}

/**
 * Remove opened or marked-read notices from this person's box only.
 * Unread notices stay. The shared row is left in place; expiry deletes it
 * once nobody should still see it.
 */
export function clearReadNotices(
  notifications: HubNotification[] | null | undefined,
  clearedNotices: ClearedNotices | null | undefined,
  user: NoticeAudienceMember,
  nowMs = Date.now()
): { notifications: HubNotification[]; clearedNotices: ClearedNotices | null | undefined } {
  const rows = notifications ?? [];
  const source = clearedNotices ?? {};
  let ledger: ClearedNotices = source;
  let changed = false;
  const clearedAt = new Date(nowMs).toISOString();
  const next = rows.map((raw) => {
    const n = normalizeNotification(raw);
    if (!notificationVisibleTo(n, user)) return raw;
    if (!wasReadBy(n, user.id)) return raw;
    const recorded = Boolean(ledger[n.id]?.[user.id]);
    const flagged = clearedByUser(n, user.id);
    if (flagged && recorded) return raw;
    if (!flagged && !recorded && !notificationVisibleForUser(n, user.id, nowMs)) {
      return raw;
    }
    changed = true;
    const at = ledger[n.id]?.[user.id] ?? clearedAt;
    ledger = {
      ...ledger,
      [n.id]: { ...(ledger[n.id] ?? {}), [user.id]: at },
    };
    if (flagged) return raw;
    return {
      ...n,
      clearedByUserIds: [...(n.clearedByUserIds ?? []), user.id],
    };
  });
  if (!changed) return { notifications: rows, clearedNotices };
  return { notifications: next, clearedNotices: ledger };
}

/** @deprecated use notificationVisibleForUser — kept for store re-exports */
export function notificationIsAlive(
  n: HubNotification,
  nowMs = Date.now()
): boolean {
  return notificationShouldRetain(n, nowMs);
}
