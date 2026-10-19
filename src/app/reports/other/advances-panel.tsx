"use client";

import { useMemo, useState } from "react";
import type { FlowhubData } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { matchesAny } from "@/lib/list-search";
import {
  RECOVERABLE_ADVANCES_HEADERS,
  buildRecoverableAdvanceRows,
  recoverableAdvanceExportRows,
  sumRecoverableAdvances,
} from "@/lib/recoverable-advances-report";
import { ListSearchBar } from "@/components/list-search";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { cn } from "@/lib/utils";
import {
  ReportsTableScroll,
  reportMoney,
  reportTd,
  reportTh,
} from "../reports-shell";

const theadClass =
  "border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]";

/** Contracts with a recoverable payment. Figures match the payment-form pool. */
export function RecoverableAdvancesPanel({ data }: { data: FlowhubData }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => buildRecoverableAdvanceRows(data), [data]);
  const rows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) =>
      matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.advance,
        formatMoney(r.advance),
        r.recovered,
        formatMoney(r.recovered),
        r.left,
        formatMoney(r.left),
      ])
    );
  }, [all, q]);
  const totals = useMemo(() => sumRecoverableAdvances(rows), [rows]);

  return (
    <>
      <ListSearchBar
        className="mt-4"
        value={q}
        onChange={setQ}
        placeholder="Search project…"
      />
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[40%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              {RECOVERABLE_ADVANCES_HEADERS.map((header, i) => (
                <th
                  key={header}
                  className={cn(reportTh, i > 0 && "text-right")}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={RECOVERABLE_ADVANCES_HEADERS.length}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  {all.length === 0
                    ? "No recoverable advances."
                    : "No matching projects."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.contractId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={reportMoney}>{formatMoney(r.advance)}</td>
                  <td className={reportMoney}>{formatMoney(r.recovered)}</td>
                  <td className={reportMoney}>{formatMoney(r.left)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
              <tr>
                <td className={reportTd}>Total</td>
                <td className={reportMoney}>{formatMoney(totals.advance)}</td>
                <td className={reportMoney}>{formatMoney(totals.recovered)}</td>
                <td className={reportMoney}>{formatMoney(totals.left)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="recoverable-advances"
        title="Other Reports — Recoverable advances"
        filters={reportFilterSummary({
          tab: "Recoverable advances",
          search: q,
        })}
        headers={[...RECOVERABLE_ADVANCES_HEADERS]}
        rows={recoverableAdvanceExportRows(rows)}
      />
    </>
  );
}
