import type { HubNotification, Task } from "@/lib/types";

/** Deep-link to where the user can act on / enter data for this task. */
export function taskNotificationHref(task: Task): string {
  const contractId = task.contractId;
  switch (task.catalogKey) {
    case "create_abg":
    case "bg_expiry_abg":
      return contractId ? `/contracts/${contractId}#abg` : "/contracts";
    case "create_pbg":
    case "bg_expiry_pbg":
      return contractId ? `/contracts/${contractId}#pbg` : "/contracts";
    case "collect_retention":
      return contractId ? `/contracts/${contractId}#retention` : "/payments";
    default: {
      if (task.parentId) {
        return `/tasks/${task.parentId}?sub=${encodeURIComponent(task.id)}`;
      }
      return `/tasks/${task.id}`;
    }
  }
}

/** Prefer a live task-based href so older stored links still land on the entry page. */
export function resolveNotificationHref(
  n: HubNotification,
  tasks: Task[]
): string {
  if (n.taskId) {
    const task = tasks.find((t) => t.id === n.taskId);
    if (task) return taskNotificationHref(task);
  }
  if (n.href.includes("highlight=")) {
    return n.href.replace("highlight=", "task=");
  }
  return n.href;
}
