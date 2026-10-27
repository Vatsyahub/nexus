export const HUB_THEME_KEY = "nexus-hub-theme";

export const HUB_THEMES = [
  { id: "light", label: "Default", masterOnly: false },
  { id: "dark", label: "Dark", masterOnly: false },
  { id: "red", label: "Red", masterOnly: false },
  { id: "blue", label: "Blue", masterOnly: false },
  { id: "green", label: "Green", masterOnly: false },
  { id: "dark-knight", label: "Dark knight", masterOnly: true },
  { id: "matrix", label: "Matrix", masterOnly: true },
] as const;

export type HubThemeId = (typeof HUB_THEMES)[number]["id"];

const PUBLIC_THEME_IDS = HUB_THEMES.filter((theme) => !theme.masterOnly).map(
  (theme) => theme.id
);

const MASTER_THEME_IDS = HUB_THEMES.filter((theme) => theme.masterOnly).map(
  (theme) => theme.id
);

/** Themes that use Tailwind's `.dark` variant (night steel, Dark knight, Matrix). */
const DARK_CLASS_THEME_IDS: readonly HubThemeId[] = [
  "dark",
  "dark-knight",
  "matrix",
];

export function isHubThemeId(value: string | null): value is HubThemeId {
  return HUB_THEMES.some((theme) => theme.id === value);
}

/**
 * Dark knight and Matrix are Master only, and hidden while Master is impersonating
 * so another clearance never sees them.
 */
export function sessionAllowsMasterThemes(session: {
  user?: { clearance?: string | null; impersonating?: boolean | null } | null;
} | null | undefined): boolean {
  return (
    session?.user?.clearance === "master" && session.user.impersonating !== true
  );
}

export function visibleHubThemes(allowMasterThemes: boolean) {
  return HUB_THEMES.filter((theme) => !theme.masterOnly || allowMasterThemes);
}

export function hubThemeAllowed(
  id: HubThemeId,
  allowMasterThemes: boolean
): boolean {
  const theme = HUB_THEMES.find((item) => item.id === id);
  return !!theme && (!theme.masterOnly || allowMasterThemes);
}

export function readHubTheme(allowMasterThemes: boolean): HubThemeId {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(HUB_THEME_KEY);
    if (!isHubThemeId(raw)) return "light";
    if (!hubThemeAllowed(raw, allowMasterThemes)) return "light";
    return raw;
  } catch {
    /* private mode */
  }
  return "light";
}

export function applyHubTheme(choice: HubThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = choice;
  root.dataset.themeChoice = choice;
  root.classList.toggle(
    "dark",
    (DARK_CLASS_THEME_IDS as readonly string[]).includes(choice)
  );
}

/**
 * Runs before paint. The hub opens on Default (steel and gold).
 * Saved "system" is ignored. "dark" is the general night-steel theme.
 * Dark knight and Matrix apply only for a real Master session;
 * every other clearance falls back to Default.
 */
export function hubThemeBootScript(allowMasterThemes: boolean): string {
  const allow = allowMasterThemes ? "true" : "false";
  const key = JSON.stringify(HUB_THEME_KEY);
  const publics = PUBLIC_THEME_IDS.map((id) => `c===${JSON.stringify(id)}`).join(
    "||"
  );
  const masters = MASTER_THEME_IDS.map((id) => `c===${JSON.stringify(id)}`).join(
    "||"
  );
  const darkClass = DARK_CLASS_THEME_IDS.map(
    (id) => `c===${JSON.stringify(id)}`
  ).join("||");
  return `(function(){try{var allow=${allow};var c=localStorage.getItem(${key});var ok=${publics}||((${masters})&&allow);if(!ok)c="light";var r=document.documentElement;r.dataset.theme=c;r.dataset.themeChoice=c;r.classList.toggle("dark",${darkClass});}catch(e){}})();`;
}
