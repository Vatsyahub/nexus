"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmActionLabel = "Delete" | "Clear" | "Remove" | "Save anyway";

type Pending = {
  message: string;
  action: ConfirmActionLabel;
  resolve: (ok: boolean) => void;
};

let pending: Pending | null = null;
const queue: Pending[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function show(next: Pending) {
  if (pending) queue.push(next);
  else {
    pending = next;
    emit();
  }
}

function settle(ok: boolean) {
  const current = pending;
  pending = queue.shift() ?? null;
  emit();
  current?.resolve(ok);
}

export function confirmAction(options: {
  message: string;
  action: ConfirmActionLabel;
}): Promise<boolean> {
  return new Promise((resolve) => {
    show({
      message: options.message,
      action: options.action,
      resolve,
    });
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getPending(): Pending | null {
  return pending;
}

function getServerPending(): Pending | null {
  return null;
}

/** One confirmation panel for the whole app. */
export function ConfirmPanel() {
  const current = useSyncExternalStore(
    subscribe,
    getPending,
    getServerPending
  );

  useEffect(() => {
    if (!current) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      settle(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [current]);

  if (!current) return null;

  const saveAnyway = current.action === "Save anyway";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={() => settle(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-panel-message"
        data-confirm-panel="open"
        className="w-full max-w-md rounded-xl border border-[var(--fh-line)] bg-white p-5 shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p
          id="confirm-panel-message"
          className="text-sm leading-relaxed text-[var(--fh-ink)]"
        >
          {current.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            autoFocus
            onClick={() => settle(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            data-confirm-action={current.action}
            className={cn(
              saveAnyway
                ? "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
                : "bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90"
            )}
            onClick={() => settle(true)}
          >
            {current.action}
          </Button>
        </div>
      </div>
    </div>
  );
}
