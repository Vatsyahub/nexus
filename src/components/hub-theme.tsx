"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  HUB_THEME_KEY,
  applyHubTheme,
  hubThemeAllowed,
  readHubTheme,
  sessionAllowsMasterThemes,
  visibleHubThemes,
  type HubThemeId,
} from "@/lib/hub-theme";
import { cn } from "@/lib/utils";

const SWATCH: Record<
  HubThemeId,
  { page: string; panel: string; bar: string; accent: string }
> = {
  light: { page: "#eef1f4", panel: "#ffffff", bar: "#1b3a4b", accent: "#e3a008" },
  dark: { page: "#0e171e", panel: "#162430", bar: "#1b3a4b", accent: "#e3a008" },
  red: { page: "#f4f1f0", panel: "#fffcfb", bar: "#72464d", accent: "#c48b86" },
  blue: { page: "#f1f4f6", panel: "#ffffff", bar: "#415772", accent: "#8aa4b5" },
  green: { page: "#f1f4f1", panel: "#ffffff", bar: "#3c5e4c", accent: "#8aab96" },
  "dark-knight": {
    page: "#0c0e12",
    panel: "#171a20",
    bar: "#101218",
    accent: "#d4b36a",
  },
  matrix: {
    page: "#000000",
    panel: "#04140c",
    bar: "#001408",
    accent: "#00ff41",
  },
};

export function HubThemeSync() {
  const { data: session, status } = useSession();
  const allowMasterThemes = sessionAllowsMasterThemes(session);

  useEffect(() => {
    if (status === "loading") return;
    applyHubTheme(readHubTheme(allowMasterThemes));
  }, [allowMasterThemes, status]);

  return null;
}

export function HubThemePicker() {
  const { data: session, status } = useSession();
  const allowMasterThemes = sessionAllowsMasterThemes(session);
  const [choice, setChoice] = useState<HubThemeId>("light");

  useEffect(() => {
    if (status === "loading") return;
    const next = readHubTheme(allowMasterThemes);
    setChoice(next);
    applyHubTheme(next);
  }, [allowMasterThemes, status]);

  function pick(next: HubThemeId) {
    if (!hubThemeAllowed(next, allowMasterThemes)) return;
    setChoice(next);
    try {
      localStorage.setItem(HUB_THEME_KEY, next);
    } catch {
      /* private mode — still apply for this visit */
    }
    applyHubTheme(next);
  }

  const themes = visibleHubThemes(allowMasterThemes);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Hub colour">
      {themes.map((theme) => {
        const selected = choice === theme.id;
        const swatch = SWATCH[theme.id];
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={selected}
            onClick={() => pick(theme.id)}
            className={cn(
              "flex w-[4.75rem] flex-col items-center gap-1 rounded-lg border px-1.5 py-1.5 transition",
              selected
                ? "border-[var(--fh-accent)] ring-2 ring-[var(--fh-accent)]"
                : "border-[var(--fh-line)] hover:border-[var(--fh-steel)]/40"
            )}
          >
            <span
              className="flex h-7 w-full overflow-hidden rounded border border-black/10"
              aria-hidden
            >
              <span className="w-2 shrink-0" style={{ background: swatch.bar }} />
              <span
                className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-1"
                style={{ background: swatch.page }}
              >
                <span
                  className="h-2 rounded-[2px]"
                  style={{ background: swatch.panel }}
                />
                <span
                  className="h-1 w-3/5 rounded-[2px]"
                  style={{ background: swatch.accent }}
                />
              </span>
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium leading-none text-[var(--fh-ink)]">
              {theme.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
