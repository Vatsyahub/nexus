"use client";

import { useMemo } from "react";
import type { FlowhubData } from "@/lib/types";
import { useViewQuery } from "@/lib/use-view-query";
import { ListSearchBar } from "@/components/list-search";
import { ListWindowNote } from "@/components/list-window-note";
import { HubDataScroll } from "@/components/hub-scroll";
import { DcRecordTable } from "@/components/dc-record-table";
import { LIST_WINDOW_ORDER, listIsFiltered, windowList } from "@/lib/list-window";
import {
  buildDispatchListRows,
  filterDispatchListRows,
} from "@/lib/execution-reports";

export function DispatchList({ data }: { data: FlowhubData }) {
  const { get, commit } = useViewQuery();
  const q = get("q");
  const all = useMemo(() => buildDispatchListRows(data), [data]);
  const filtered = listIsFiltered({ search: q });
  const matched = useMemo(
    () => filterDispatchListRows(all, q),
    [all, q]
  );
  const listed = useMemo(
    () =>
      windowList(matched, {
        filtered,
        order: LIST_WINDOW_ORDER.dispatch,
        date: (row) => row.dcDate,
        createdAt: (row) => row.createdAt,
      }),
    [matched, filtered]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <ListSearchBar
        value={q}
        onChange={(value) => commit({ q: value || null })}
        placeholder="Search project, item, or DC no."
      />
      <ListWindowNote
        capped={listed.capped}
        order={LIST_WINDOW_ORDER.dispatch}
      />
      <HubDataScroll className="overflow-x-auto rounded-lg border border-[var(--fh-line)] bg-white">
        <DcRecordTable
          rows={listed.rows}
          emptyText={
            all.length === 0
              ? "No delivery challans yet."
              : "No matching delivery challans."
          }
        />
      </HubDataScroll>
    </div>
  );
}
