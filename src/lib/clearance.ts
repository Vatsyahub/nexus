export type ClearanceRole = "user" | "manager" | "director" | "master";

export type NavClearance = "everyone" | "master" | "master_director";

export function clearanceFromDb(
  value: "USER" | "MANAGER" | "DIRECTOR" | "MASTER" | string
): ClearanceRole {
  switch (value) {
    case "MASTER":
      return "master";
    case "DIRECTOR":
      return "director";
    case "MANAGER":
      return "manager";
    default:
      return "user";
  }
}

export function visibleForClearance(
  itemClearance: NavClearance,
  role: ClearanceRole
) {
  if (itemClearance === "everyone") return true;
  if (itemClearance === "master") return role === "master";
  if (itemClearance === "master_director")
    return role === "master" || role === "director";
  return false;
}

export function canAccessPath(pathname: string, role: ClearanceRole) {
  if (pathname.startsWith("/users")) return role === "master";
  if (pathname.startsWith("/nexus-core"))
    return role === "master" || role === "director";
  return true;
}
