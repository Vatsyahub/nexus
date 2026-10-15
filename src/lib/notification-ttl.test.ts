import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTIFICATION_TTL_MS,
  NOTIFICATION_UNREAD_TTL_MS,
  clearReadNotices,
  mergeClearedNotices,
  notificationVisibleForUser,
  pruneClearedNotices,
  purgeExpiredNotifications,
  restrictNewClearsToUser,
  stampClearedNotices,
} from "@/lib/notification-ttl";
import type { NoticeAudienceMember } from "@/lib/notification-ttl";
import { notificationVisibleTo } from "@/lib/task-notices";
import type { HubNotification } from "@/lib/types";

const createdAt = "2026-10-15T12:00:00.000Z";
const now = Date.parse("2026-10-15T15:00:00.000Z");

const alice: NoticeAudienceMember = {
  id: "alice",
  name: "Alice",
  department: "Contracts",
  clearance: "manager",
};
const bob: NoticeAudienceMember = {
  id: "bob",
  name: "Bob",
  department: "Contracts",
  clearance: "manager",
};

function notice(
  partial: Partial<HubNotification> & Pick<HubNotification, "id">
): HubNotification {
  return {
    createdAt,
    kind: "task_assigned",
    title: "Task assigned to you",
    body: "Check drawings",
    href: "/tasks",
    taskId: "task-1",
    contractId: "contract-1",
    audienceUserNames: [],
    audienceDepartment: null,
    audienceClearance: null,
    createdBy: null,
    readByUserIds: [],
    readAtByUserIds: {},
    ...partial,
  };
}

function readBy(userId: string): Pick<
  HubNotification,
  "readByUserIds" | "readAtByUserIds"
> {
  return {
    readByUserIds: [userId],
    readAtByUserIds: { [userId]: createdAt },
  };
}

function sees(user: NoticeAudienceMember, rows: HubNotification[]) {
  return rows.filter(
    (row) =>
      notificationVisibleTo(row, user) &&
      notificationVisibleForUser(row, user.id, now)
  );
}

test("a read notice still shows for 24 hours until that person clears it", () => {
  const row = notice({
    id: "ttl",
    audienceUserNames: ["Alice"],
    ...readBy("alice"),
  });
  const within = Date.parse(createdAt) + NOTIFICATION_TTL_MS - 1000;
  const after = Date.parse(createdAt) + NOTIFICATION_TTL_MS + 1000;
  assert.equal(notificationVisibleForUser(row, "alice", within), true);
  assert.equal(purgeExpiredNotifications([row], within, [alice]).length, 1);
  assert.equal(notificationVisibleForUser(row, "alice", after), false);
  assert.equal(purgeExpiredNotifications([row], after, [alice]).length, 0);
});

test("clear drops opened or marked-read notices for that person only", () => {
  const unread = notice({
    id: "unread",
    audienceUserNames: ["Alice", "Bob"],
  });
  const opened = notice({
    id: "opened",
    audienceUserNames: ["Alice", "Bob"],
    ...readBy("alice"),
  });
  const marked = notice({
    id: "marked",
    audienceUserNames: ["Alice"],
    readByUserIds: ["alice"],
    readAtByUserIds: { alice: createdAt },
  });
  const bobOnly = notice({
    id: "bob-only",
    audienceUserNames: ["Bob"],
    ...readBy("bob"),
  });
  const ledger = {};
  const cleared = clearReadNotices(
    [unread, opened, marked, bobOnly],
    ledger,
    alice,
    now
  );

  assert.equal(cleared.notifications[0], unread);
  assert.deepEqual(unread.readByUserIds, []);
  assert.equal(cleared.clearedNotices?.unread, undefined);
  assert.equal(sees(alice, cleared.notifications).map((row) => row.id).join(), "unread");
  assert.equal(
    sees(bob, cleared.notifications).map((row) => row.id).join(),
    "unread,opened,bob-only"
  );
  assert.deepEqual(
    cleared.notifications.find((row) => row.id === "opened")?.clearedByUserIds,
    ["alice"]
  );
  assert.deepEqual(
    cleared.notifications.find((row) => row.id === "opened")?.readByUserIds,
    ["alice"]
  );
  assert.equal(
    notificationVisibleForUser(
      cleared.notifications.find((row) => row.id === "marked")!,
      "alice",
      now
    ),
    false
  );
  assert.equal(cleared.notifications.find((row) => row.id === "bob-only"), bobOnly);
  const purged = purgeExpiredNotifications(
    stampClearedNotices(cleared.notifications, cleared.clearedNotices),
    now,
    [alice, bob]
  );
  assert.equal(purged.find((row) => row.id === "marked"), undefined);
  assert.ok(purged.some((row) => row.id === "opened"));
  assert.ok(purged.some((row) => row.id === "unread"));
  assert.equal(cleared.clearedNotices?.opened?.alice, new Date(now).toISOString());
  assert.equal(cleared.clearedNotices?.["bob-only"], undefined);

  const again = clearReadNotices(
    cleared.notifications,
    cleared.clearedNotices,
    alice,
    now
  );
  assert.equal(again.notifications, cleared.notifications);
  assert.equal(again.clearedNotices, cleared.clearedNotices);
  assert.deepEqual(
    cleared.notifications.find((row) => row.id === "opened")?.clearedByUserIds,
    ["alice"]
  );
});

test("clearing does not delete a shared row someone else can still see", () => {
  const shared = notice({
    id: "shared",
    audienceUserNames: ["Alice", "Bob"],
    ...readBy("alice"),
  });
  const cleared = clearReadNotices([shared], {}, alice, now);
  assert.equal(cleared.notifications.length, 1);
  assert.equal(sees(alice, cleared.notifications).length, 0);
  assert.equal(sees(bob, cleared.notifications).length, 1);

  const kept = purgeExpiredNotifications(
    stampClearedNotices(cleared.notifications, cleared.clearedNotices),
    now,
    [alice, bob]
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.id, "shared");
  assert.equal(notificationVisibleForUser(kept[0]!, "alice", now), false);
  assert.equal(notificationVisibleForUser(kept[0]!, "bob", now), true);

  const later = now + 60 * 60 * 1000;
  const still = purgeExpiredNotifications(kept, later, [alice, bob]);
  assert.equal(still.length, 1);
  assert.equal(notificationVisibleForUser(still[0]!, "alice", later), false);
  assert.equal(notificationVisibleForUser(still[0]!, "bob", later), true);
});

test("a cleared notice does not come back for that person", () => {
  const solo = notice({
    id: "solo",
    audienceUserNames: ["Alice"],
    ...readBy("alice"),
  });
  const cleared = clearReadNotices([solo], {}, alice, now);
  assert.equal(sees(alice, cleared.notifications).length, 0);

  const purged = purgeExpiredNotifications(
    stampClearedNotices(cleared.notifications, cleared.clearedNotices),
    now,
    [alice]
  );
  assert.equal(purged.length, 0);

  const restored = stampClearedNotices([solo], cleared.clearedNotices);
  assert.equal(notificationVisibleForUser(restored[0]!, "alice", now), false);
  assert.equal(purgeExpiredNotifications(restored, now, [alice]).length, 0);
});

test("one manager can clear a department notice without hiding it from the other", () => {
  const row = notice({
    id: "dept",
    kind: "task_department",
    audienceDepartment: "Contracts",
    ...readBy("alice"),
  });
  const cleared = clearReadNotices([row], {}, alice, now);
  const kept = purgeExpiredNotifications(
    stampClearedNotices(cleared.notifications, cleared.clearedNotices),
    now,
    [alice, bob]
  );
  assert.equal(kept.length, 1);
  assert.equal(notificationVisibleForUser(kept[0]!, "alice", now), false);
  assert.equal(notificationVisibleForUser(kept[0]!, "bob", now), true);
  assert.equal(notificationVisibleTo(kept[0]!, bob), true);
});

test("a later save cannot remove a clear or add one for somebody else", () => {
  const row = notice({
    id: "shared",
    audienceUserNames: ["Alice", "Bob"],
    ...readBy("alice"),
    clearedByUserIds: ["alice"],
  });
  const currentLedger = { shared: { alice: createdAt } };
  const stale = notice({
    id: "shared",
    audienceUserNames: ["Alice", "Bob"],
    readByUserIds: [],
    readAtByUserIds: {},
    clearedByUserIds: ["carol"],
  });
  const restricted = restrictNewClearsToUser(
    [row],
    [stale],
    currentLedger,
    { shared: { alice: createdAt, carol: createdAt } },
    "bob"
  );
  assert.deepEqual(restricted.notifications[0]?.clearedByUserIds, ["alice"]);
  assert.deepEqual(restricted.clearedNotices.shared, { alice: createdAt });
  assert.equal(
    notificationVisibleForUser(restricted.notifications[0]!, "alice", now),
    false
  );
  assert.equal(
    notificationVisibleForUser(restricted.notifications[0]!, "bob", now),
    true
  );

  const own = restrictNewClearsToUser(
    [notice({ id: "shared", audienceUserNames: ["Alice", "Bob"] })],
    [notice({
      id: "shared",
      audienceUserNames: ["Alice", "Bob"],
      ...readBy("alice"),
      clearedByUserIds: ["alice"],
    })],
    {},
    { shared: { alice: createdAt } },
    "alice"
  );
  assert.deepEqual(own.notifications[0]?.clearedByUserIds, ["alice"]);
  assert.equal(own.clearedNotices.shared?.alice, createdAt);
});

test("cleared-notice memory outlasts the shared row and then expires", () => {
  const recent = new Date(now - 60_000).toISOString();
  const old = new Date(now - NOTIFICATION_UNREAD_TTL_MS - 1000).toISOString();
  const pruned = pruneClearedNotices(
    { live: { alice: recent }, spent: { alice: old } },
    now
  );
  assert.equal(pruned.live?.alice, recent);
  assert.equal(pruned.spent, undefined);

  const merged = mergeClearedNotices(
    { shared: { alice: createdAt } },
    { shared: { bob: createdAt } }
  );
  assert.deepEqual(merged.shared, { alice: createdAt, bob: createdAt });
});
