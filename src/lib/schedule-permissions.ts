import type { AccessLevel } from "@/lib/access";

/**
 * Schedules door. Edit can change lines and delete a whole schedule.
 * View and Block cannot. Master always can, even if a saved map says otherwise.
 * Callers that only pass a department (older screens) keep that fallback.
 */
export function canEditSchedules(opts: {
  clearance: string | null | undefined;
  accessLevel?: AccessLevel | null | undefined;
  department?: string | null | undefined;
}): boolean {
  if ((opts.clearance || "").toLowerCase() === "master") return true;
  if (opts.accessLevel != null) return opts.accessLevel === "edit";
  if ((opts.clearance || "").toLowerCase() === "director") return false;
  const dept = (opts.department || "").trim().toLowerCase();
  return dept.startsWith("contracts");
}
