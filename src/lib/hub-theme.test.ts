import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import {
  hubThemeAllowed,
  hubThemeBootScript,
  readHubTheme,
  sessionAllowsMasterThemes,
  visibleHubThemes,
} from "@/lib/hub-theme";

function session(clearance: string, impersonating = false) {
  return { user: { clearance, impersonating } };
}

test("Matrix and Dark knight are Master themes; other colours are not", () => {
  const master = visibleHubThemes(true).map((theme) => theme.id);
  const other = visibleHubThemes(false).map((theme) => theme.id);
  assert.ok(master.includes("matrix"));
  assert.ok(master.includes("dark-knight"));
  assert.equal(other.includes("matrix"), false);
  assert.equal(other.includes("dark-knight"), false);
  for (const id of ["light", "dark", "red", "blue", "green"] as const) {
    assert.ok(other.includes(id));
    assert.equal(hubThemeAllowed(id, false), true);
  }
  assert.equal(hubThemeAllowed("matrix", false), false);
  assert.equal(hubThemeAllowed("matrix", true), true);
  assert.equal(hubThemeAllowed("dark-knight", false), false);
});

test("only a real Master session may use Matrix", () => {
  assert.equal(sessionAllowsMasterThemes(session("master")), true);
  assert.equal(sessionAllowsMasterThemes(session("master", true)), false);
  for (const clearance of ["director", "manager", "user"]) {
    assert.equal(sessionAllowsMasterThemes(session(clearance)), false);
  }
  assert.equal(sessionAllowsMasterThemes(null), false);
  assert.equal(sessionAllowsMasterThemes({}), false);
});

test("a saved Matrix theme is ignored unless this session may use it", () => {
  const view = globalThis as unknown as {
    window: unknown;
    localStorage: { getItem: (key: string) => string | null };
  };
  const previousWindow = view.window;
  const previousStorage = view.localStorage;
  view.window = globalThis;
  view.localStorage = { getItem: () => "matrix" };
  try {
    assert.equal(readHubTheme(false), "light");
    assert.equal(readHubTheme(true), "matrix");
  } finally {
    view.window = previousWindow;
    view.localStorage = previousStorage;
  }
});

function boot(allow: boolean, stored: string | null) {
  const root = {
    dataset: {} as Record<string, string>,
    classList: {
      names: new Set<string>(),
      toggle(name: string, on?: boolean) {
        const next = on ?? !this.names.has(name);
        if (next) this.names.add(name);
        else this.names.delete(name);
        return next;
      },
    },
  };
  const context = {
    localStorage: { getItem: () => stored },
    document: { documentElement: root },
  };
  vm.createContext(context);
  vm.runInContext(hubThemeBootScript(allow), context);
  return root;
}

test("boot script never paints Matrix for another clearance", () => {
  const blocked = boot(false, "matrix");
  assert.equal(blocked.dataset.theme, "light");
  assert.equal(blocked.classList.names.has("dark"), false);

  const master = boot(true, "matrix");
  assert.equal(master.dataset.theme, "matrix");
  assert.equal(master.classList.names.has("dark"), true);

  const knight = boot(false, "dark-knight");
  assert.equal(knight.dataset.theme, "light");
  const knightMaster = boot(true, "dark-knight");
  assert.equal(knightMaster.dataset.theme, "dark-knight");

  const day = boot(false, "green");
  assert.equal(day.dataset.theme, "green");
  assert.equal(day.classList.names.has("dark"), false);
});
