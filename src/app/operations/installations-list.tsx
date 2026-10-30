"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { FlowhubData } from "@/lib/types";
import { useViewQuery } from "@/lib/use-view-query";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import {
  buildInstallationListRows,
  filterInstallationListRows,
} from "@/lib/execution-reports";
import { ListSearchBar } from "@/components/list-search";
import { ListWindowNote } from "@/components/list-window-note";
import { HubDataScroll } from "@/components/hub-scroll";
import { LIST_WINDOW_ORDER, listIsFiltered, windowList } from "@/lib/list-window";

export function InstallationsList({ data }: { data: FlowhubData }) {
  const router = useRouter();
  const { get, commit } = useViewQuery();
  const q = get("q");
  const all = useMemo(() => buildInstallationListRows(data), [data]);
  const filtered = listIsFiltered({ search: q });
  const matched = useMemo(
    () => filterInstallationListRows(all, q),
    [all, q]
  );
  const listed = useMemo(
    () =>
      windowList(matched, {
        filtered,
        order: LIST_WINDOW_ORDER.installations,
        date: (row) => row.date,
        createdAt: (row) => row.recordedAt,
      }),
    [matched, filtered]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <ListSearchBar
        value={q}
        onChange={(value) => commit({ q: value || null })}
        placeholder="Search project or item"
      />
      <ListWindowNote
        capped={listed.capped}
        order={LIST_WINDOW_ORDER.installations}
      />
      <HubDataScroll className="overflow-x-auto rounded-lg border border-[var(--fh-line)] bg-white">
        <table className="list-sticky-head w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Items</th>
              <th className="px-3 py-2 text-right font-medium">Current qty</th>
              <th className="px-3 py-2 text-right font-medium">
                Total installed qty
              </th>
            </tr>
          </thead>
          <tbody>
            {listed.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  {all.length === 0
                    ? "No installation updates yet."
                    : "No matching installations."}
                </td>
              </tr>
            ) : (
              listed.rows.map((row) => {
                const href = `/operations/installations/${row.contractId}`;
                const open = () => router.push(href);
                return (
                  <tr
                    key={row.key}
                    className="cursor-pointer border-t border-[var(--fh-line)] hover:bg-[var(--fh-bg)]/80"
                    onClick={open}
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">{row.projectName}</span>
                      <p className="text-xs text-[var(--fh-muted)]">
                        {row.projectNo}
                      </p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDisplayDate(row.date)}
                    </td>
                    <td className="px-3 py-2">
                      {row.items.map((item) => (
                        <p key={item.historyId} className="break-words">
                          {item.itemName}
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.items.map((item) => (
                        <p key={item.historyId}>{formatQty(item.delta)}</p>
                      ))}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {row.items.map((item) => (
                        <p key={item.historyId}>{formatQty(item.qtyNow)}</p>
                      ))}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </HubDataScroll>
    </div>
  );
}
