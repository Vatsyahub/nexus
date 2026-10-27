const STORAGE_KEY = "nexus-hub-nav-stack";
const MAX_STACK = 50;

export type ViewPatch = Record<string, string | null | undefined>;
export type HubStep = "auto" | "push" | "replace";

type Store = Pick<Storage, "getItem" | "setItem">;

export function pathnameOf(href: string): string {
  const bare = href.split("#")[0] ?? href;
  const q = bare.indexOf("?");
  let path = q === -1 ? bare : bare.slice(0, q);
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

/** Merge view keys into a query string. Empty values are removed. Other keys stay. */
export function applySearchPatch(currentSearch: string, patch: ViewPatch): string {
  const raw = currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch;
  const params = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(patch)) {
    const next = value == null ? "" : String(value);
    if (!next) params.delete(key);
    else params.set(key, next);
  }
  return params.toString();
}

export function hrefWithPatch(
  pathname: string,
  currentSearch: string,
  patch: ViewPatch
): string {
  const qs = applySearchPatch(currentSearch, patch);
  return qs ? `${pathname}?${qs}` : pathname;
}

function trim(stack: string[]): string[] {
  return stack.length > MAX_STACK ? stack.slice(stack.length - MAX_STACK) : stack;
}

/**
 * Remember the page on screen.
 * A query change on the same path replaces the current entry, so typing is not a step.
 * A different path is a new step. Drill-in on the same path passes "push".
 */
export function noteHubLocation(
  stack: string[],
  href: string,
  step: HubStep = "auto"
): string[] {
  if (!href || href.startsWith("/login")) return stack;
  const top = stack[stack.length - 1];
  if (top === href) return stack;
  const same = !!top && pathnameOf(top) === pathnameOf(href);
  const replace = step === "replace" || (step === "auto" && same);
  if (replace && (!top || same)) {
    if (!top) return [href];
    return trim([...stack.slice(0, -1), href]);
  }
  return trim([...stack, href]);
}

export function hubBackTarget(
  stack: string[]
): { stack: string[]; href: string } | null {
  if (stack.length < 2) return null;
  const next = stack.slice(0, -1);
  const href = next[next.length - 1];
  if (!href) return null;
  return { stack: next, href };
}

/** Browser back landed on `href`. Drop anything recorded after that page. */
export function stackAfterPop(stack: string[], href: string): string[] {
  if (!href) return stack;
  const idx = stack.lastIndexOf(href);
  if (idx >= 0) return stack.slice(0, idx + 1);
  const path = pathnameOf(href);
  for (let i = stack.length - 1; i >= 0; i--) {
    if (pathnameOf(stack[i] ?? "") === path) {
      return [...stack.slice(0, i), href];
    }
  }
  return noteHubLocation(stack, href, "push");
}

/**
 * Back/Cancel href. Use the previous page only when it is the same list the
 * link already points at, so a billing link does not jump to a report.
 */
export function returnHref(
  fallback: string,
  opts?: { stack?: string[]; current?: string }
): string {
  const stack = opts?.stack ?? readHubStack();
  const here =
    opts?.current ??
    (typeof window === "undefined"
      ? ""
      : `${window.location.pathname}${window.location.search}`);
  if (!here) return fallback;
  const top = stack[stack.length - 1];
  let prev: string | undefined;
  if (top === here && stack.length >= 2) prev = stack[stack.length - 2];
  else if (top && top !== here && pathnameOf(top) !== pathnameOf(here)) prev = top;
  if (!prev) return fallback;
  if (pathnameOf(prev) !== pathnameOf(fallback)) return fallback;
  return prev;
}

export function readHubStack(store?: Store): string[] {
  const memory =
    store ?? (typeof window === "undefined" ? null : window.sessionStorage);
  if (!memory) return [];
  try {
    const raw = memory.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((p): p is string => typeof p === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeHubStack(stack: string[], store?: Store): void {
  const memory =
    store ?? (typeof window === "undefined" ? null : window.sessionStorage);
  if (!memory) return;
  try {
    memory.setItem(STORAGE_KEY, JSON.stringify(trim(stack)));
  } catch {
    /* ignore quota / private mode */
  }
}

export function currentHubPath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}
