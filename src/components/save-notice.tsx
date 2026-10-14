"use client";

import { useSyncExternalStore } from "react";
import {
  dismissSaveNotice,
  getSaveNotice,
  subscribeSaveNotice,
  type SaveNotice,
} from "@/lib/save-notice";
import { cn } from "@/lib/utils";

function subscribe(listener: () => void) {
  return subscribeSaveNotice(listener);
}

function snapshot(): SaveNotice | null {
  return getSaveNotice();
}

function serverSnapshot(): SaveNotice | null {
  return null;
}

/** One save confirmation, mounted for the whole app so it survives navigation. */
export function SaveNotice() {
  const notice = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (!notice) return null;

  const error = notice.tone === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-16 z-[80] flex justify-center px-4">
      <p
        data-save-notice={notice.tone}
        role={error ? "alert" : "status"}
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-md border bg-white px-3 py-2 text-sm shadow-lg",
          error
            ? "border-[var(--destructive)]/40 text-[var(--destructive)]"
            : "border-[var(--fh-ok)]/30 text-[var(--fh-ok)]"
        )}
      >
        <span>{notice.text}</span>
        <button
          type="button"
          className="text-xs text-[var(--fh-muted)] underline-offset-2 hover:underline"
          onClick={dismissSaveNotice}
        >
          Dismiss
        </button>
      </p>
    </div>
  );
}
