export const HUB_THEME_KEY = "nexus-hub-theme";

export const HUB_THEMES = [
  { id: "light", label: "Default", masterOnly: false },
  { id: "dark", label: "Dark", masterOnly: false },
  { id: "red", label: "Red", masterOnly: false },
  { id: "blue", label: "Blue", masterOnly: false },
  { id: "green", label: "Green", masterOnly: false },
  { id: "dark-knight", label: "Dark knight", masterOnly: true },
] as const;

export type HubThemeId = (typeof HUB_THEMES)[number]["id"];

const PUBLIC_THEME_IDS: readonly HubThemeId[] = [
  "light",
  "dark",
  "red",
  "blue",
  "green",
];

export function isHubThemeId(value: string | null): value is HubThemeId {
  return HUB_THEMES.some((theme) => theme.id === value);
}

/** Dark knight is Master only, and hidden while Master is impersonating. */
export function sessionAllowsDarkKnight(session: {
  user?: { clearance?: string | null; impersonating?: boolean | null } | null;
} | null | undefined): boolean {
  return (
    session?.user?.clearance === "master" && session.user.impersonating !== true
  );
}

export function readHubTheme(allowDarkKnight: boolean): HubThemeId {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(HUB_THEME_KEY);
    if (raw === "dark-knight") return allowDarkKnight ? "dark-knight" : "light";
    if (
      raw === "light" ||
      raw === "dark" ||
      raw === "red" ||
      raw === "blue" ||
      raw === "green"
    ) {
      return raw;
    }
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
  root.classList.toggle("dark", choice === "dark" || choice === "dark-knight");
}

/**
 * Runs before paint. The hub opens on Default (steel and gold).
 * Saved "system" is ignored. "dark" is the general night-steel theme.
 * Dark knight applies only when this session is allowed to use it;
 * otherwise Default is used.
 */
export function hubThemeBootScript(allowDarkKnight: boolean): string {
  const allow = allowDarkKnight ? "true" : "false";
  const key = JSON.stringify(HUB_THEME_KEY);
  const publics = PUBLIC_THEME_IDS.map((id) => `c===${JSON.stringify(id)}`).join("||");
  return `(function(){try{var allow=${allow};var c=localStorage.getItem(${key});var ok=${publics}||(c==="dark-knight"&&allow);if(!ok)c="light";var r=document.documentElement;r.dataset.theme=c;r.dataset.themeChoice=c;r.classList.toggle("dark",c==="dark"||c==="dark-knight");}catch(e){}})();`;
}
