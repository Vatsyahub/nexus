"use client";

import { useEffect, useState } from "react";

/** Rows painted at once. Further rows stay in memory and open on request. */
export const LIST_PAGE_SIZE = 200;

/**
 * Caps a long list. `resetKey` should change when the filtered rows change
 * so a new search starts at the first page.
 */
export function useRowWindow(total: number, resetKey: string) {
  const [shown, setShown] = useState(LIST_PAGE_SIZE);

  useEffect(() => {
    setShown(LIST_PAGE_SIZE);
  }, [resetKey]);

  const visibleCount = Math.min(total, Math.max(shown, 0));
  return {
    visibleCount,
    remaining: total - visibleCount,
    showMore: () => setShown((n) => n + LIST_PAGE_SIZE),
  };
}

export function rowWindowKey(
  length: number,
  firstId?: string | null,
  lastId?: string | null
): string {
  return `${length}:${firstId ?? ""}:${lastId ?? ""}`;
}

export function useVisibleRows<T>(
  rows: readonly T[],
  idOf: (row: T) => string
) {
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const rowWindow = useRowWindow(
    rows.length,
    rowWindowKey(
      rows.length,
      rows[0] ? idOf(rows[0]) : "",
      last ? idOf(last) : ""
    )
  );
  return {
    visible: rows.slice(0, rowWindow.visibleCount),
    shown: rowWindow.visibleCount,
    total: rows.length,
    showMore: rowWindow.showMore,
  };
}

export function RowWindowFooter({
  shown,
  total,
  onShowMore,
}: {
  shown: number;
  total: number;
  onShowMore: () => void;
}) {
  if (shown >= total) return null;
  const hidden = total - shown;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--fh-line)] px-3 py-2 text-sm text-[var(--fh-muted)]">
      <span>
        Showing {shown.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}
      </span>
      <button
        type="button"
        onClick={onShowMore}
        className="font-medium text-[var(--fh-steel)] hover:underline"
      >
        Show {Math.min(hidden, LIST_PAGE_SIZE).toLocaleString("en-IN")} more
      </button>
    </div>
  );
}
