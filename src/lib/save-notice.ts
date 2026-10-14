import { flushWorkspace } from "@/lib/store";

export type SaveNotice = {
  id: number;
  tone: "ok" | "error";
  text: string;
};

const listeners = new Set<() => void>();
let current: SaveNotice | null = null;
let seq = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const SAVED_TEXT = "Saved.";
const HIDE_MS = 12000;

function emit() {
  for (const listener of listeners) listener();
}

export function getSaveNotice(): SaveNotice | null {
  return current;
}

export function subscribeSaveNotice(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissSaveNotice() {
  current = null;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = null;
  emit();
}

function showSaveNotice(notice: Omit<SaveNotice, "id">) {
  seq += 1;
  const next = { id: seq, ...notice };
  current = next;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (current?.id === next.id) dismissSaveNotice();
  }, HIDE_MS);
  emit();
}

/**
 * Show the shared save notice only after the workspace flush settles.
 * A thrown flush shows the error and does not show "Saved."
 */
export async function confirmWorkspaceSave(): Promise<boolean> {
  try {
    await flushWorkspace();
    showSaveNotice({ tone: "ok", text: SAVED_TEXT });
    return true;
  } catch (err) {
    const text =
      err instanceof Error && err.message
        ? err.message
        : "Could not save.";
    showSaveNotice({ tone: "error", text });
    return false;
  }
}
