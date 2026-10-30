"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDisplayDate } from "@/lib/dates";
import {
  formatQtyWithUnit,
  type DispatchListRow,
} from "@/lib/execution-reports";

/** One row per DC. A click anywhere on the row opens that challan. */
export function DcRecordTable({
  rows,
  emptyText,
}: {
  rows: DispatchListRow[];
  emptyText: string;
}) {
  const router = useRouter();
  return (
    <table className="list-sticky-head w-full min-w-[640px] text-left text-sm">
      <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
        <tr>
          <th className="px-3 py-2 font-medium">Project</th>
          <th className="px-3 py-2 font-medium">DC no. and date</th>
          <th className="px-3 py-2 font-medium">Items</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--fh-line)]">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-3 py-6 text-center text-[var(--fh-muted)]">
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const href = `/operations/dispatch/${row.dcId}`;
            return (
              <tr
                key={row.dcId}
                className="cursor-pointer hover:bg-[var(--fh-bg)]/80"
                onClick={() => router.push(href)}
              >
                <td className="px-3 py-2">
                  <span className="font-medium">{row.projectName}</span>
                  <p className="text-xs text-[var(--fh-muted)]">{row.projectNo}</p>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-[var(--fh-steel)] hover:underline"
                  >
                    {row.dcNo || "—"}
                  </Link>
                  <p className="text-xs tabular-nums text-[var(--fh-muted)]">
                    {formatDisplayDate(row.dcDate)}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {row.items.length === 0 ? (
                    <span className="text-[var(--fh-muted)]">—</span>
                  ) : (
                    row.items.map((item, index) => (
                      <p key={`${item.boqItemId}-${index}`}>
                        <span className="break-words">{item.itemName}</span>
                        <span className="tabular-nums text-[var(--fh-muted)]">
                          {" "}
                          · {formatQtyWithUnit(item.qty, item.unit)}
                        </span>
                      </p>
                    ))
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
