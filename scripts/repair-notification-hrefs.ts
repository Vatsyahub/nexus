import { prisma } from "../src/lib/prisma";
import {
  resolveNotificationHref,
  taskNotificationHref,
} from "../src/lib/notification-href";
import type { FlowhubData, HubNotification, Task } from "../src/lib/types";

async function main() {
  const row = await prisma.workspaceStore.findUnique({
    where: { id: "default" },
  });
  const data = (row?.data ?? {}) as FlowhubData;
  const tasks = (data.tasks ?? []) as Task[];
  const notifications = (data.notifications ?? []).map((n: HubNotification) => ({
    ...n,
    href: resolveNotificationHref(n, tasks),
  }));
  await prisma.workspaceStore.update({
    where: { id: "default" },
    data: { data: { ...data, notifications } },
  });
  console.log(
    "updated",
    notifications.length,
    notifications.map((n) => ({
      title: n.title,
      href: n.href,
      viaTask: n.taskId
        ? taskNotificationHref(
            tasks.find((t) => t.id === n.taskId) as Task
          )
        : null,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
