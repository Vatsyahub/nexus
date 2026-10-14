"use client";

import { useMemo, useState } from "react";
import type { BoqItem, Contract, FlowhubData } from "@/lib/types";
import { boqTotal } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import { ContractTypeahead } from "@/components/contract-typeahead";
import {
  ReportExportIcons,
  reportFilterSummary,
  type ReportExportCell,
} from "@/components/report-export-icons";
import { cn } from "@/lib/utils";

type Version = {
  key: string;
  kind: "wo" | "amendment";
  label: string;
  date: string;
  value: number;
  boq: BoqItem[];
};

/**
 * BOQ as on the original work order. The contract only keeps the latest BOQ,
 * so undo the first amendment's line diffs against its snapshot.
 */
function originalBoq(contract: Contract): BoqItem[] {
  const first = contract.amendments[0];
  if (!first) return contract.boq;
  const base = first.boqSnapshot.length ? first.boqSnapshot : contract.boq;
  const diffs = new Map(first.lineDiffs.map((d) => [d.boqItemId, d]));
  const out: BoqItem[] = [];
  for (const line of base) {
    const d = diffs.get(line.id);
    if (d?.kind === "added") continue;
    if (d?.kind === "qty_changed" && d.previousQty != null) {
      out.push({ ...line, quantity: d.previousQty });
    } else {
      out.push(line);
    }
  }
  for (const d of first.lineDiffs) {
    if (d.kind !== "removed") continue;
    out.push({
      id: d.boqItemId,
      catalogKey: "",
      name: d.name,
      unit: d.unit,
      rate: d.rate,
      quantity: d.previousQty ?? 0,
    });
  }
  return out;
}

function buildVersions(contract: Contract): Version[] {
  const amendments = contract.amendments;
  const wo: Version = {
    key: "wo",
    kind: "wo",
    label: "Work order",
    date: contract.orderDate,
    value: amendments.length ? amendments[0].previousOrderValue : contract.orderValue,
    boq: originalBoq(contract),
  };
  return [
    wo,
    ...amendments.map((a, i) => ({
      key: a.id,
      kind: "amendment" as const,
      label: `Amendment ${a.number}`,
      date: a.date,
      value: a.newOrderValue,
      boq:
        a.boqSnapshot.length || i < amendments.length - 1
          ? a.boqSnapshot
          : contract.boq,
    })),
  ];
}

type LineRow = {
  id: string;
  name: string;
  unit: string;
  cells: (BoqItem | null)[];
};

/** One row per BOQ line across all versions so items line up side by side. */
function buildLineRows(versions: Version[]): LineRow[] {
  const order: string[] = [];
  const meta = new Map<string, { name: string; unit: string }>();
  for (const v of versions) {
    for (const l of v.boq) {
      if (!meta.has(l.id)) order.push(l.id);
      meta.set(l.id, { name: l.name, unit: l.unit });
    }
  }
  return order.map((id) => ({
    id,
    name: meta.get(id)!.name,
    unit: meta.get(id)!.unit,
    cells: versions.map((v) => v.boq.find((l) => l.id === id) ?? null),
  }));
}

type CellChange = "same" | "added" | "removed" | "changed" | "absent";

function cellChange(row: LineRow, i: number): CellChange {
  const cur = row.cells[i];
  if (i === 0) return cur ? "same" : "absent";
  const prev = row.cells[i - 1];
  if (!cur) return prev ? "removed" : "absent";
  if (!prev) return "added";
  const qtyDiff = Math.abs((Number(cur.quantity) || 0) - (Number(prev.quantity) || 0)) > 1e-9;
  const rateDiff = Math.abs((Number(cur.rate) || 0) - (Number(prev.rate) || 0)) > 0.005;
  return qtyDiff || rateDiff ? "changed" : "same";
}

const cellTone: Record<CellChange, string> = {
  same: "",
  absent: "text-[var(--fh-muted)]",
  added: "bg-emerald-50 text-emerald-900",
  removed: "bg-red-50 text-red-800",
  changed: "bg-amber-50 text-amber-900",
};

const th =
  "px-2 py-1.5 align-bottom text-[10px] font-medium uppercase leading-tight tracking-wide sm:text-xs";
const td = "px-2 py-1.5 align-top text-xs break-words sm:text-sm";
const num = "px-2 py-1.5 text-right align-top text-xs tabular-nums sm:text-sm";

export function AmendmentsPanel({ data }: { data: FlowhubData }) {
  const [contractId, setContractId] = useState("");
  const contracts = useMemo(
    () => [...data.contracts].sort((a, b) => a.projectNo.localeCompare(b.projectNo)),
    [data.contracts]
  );
  const contract = contracts.find((c) => c.id === contractId) ?? null;
  const versions = useMemo(() => (contract ? buildVersions(contract) : []), [contract]);
  const lines = useMemo(() => buildLineRows(versions), [versions]);
  const hasAmendments = versions.length > 1;

  const exportHeaders = [
    "BOQ item",
    "Unit",
    ...versions.flatMap((v) => {
      const tag = `${v.kind === "wo" ? "WO" : v.label.replace("Amendment ", "")} (${formatDisplayDate(v.date)})`;
      return [`${tag} qty`, `${tag} rate`, `${tag} amount`];
    }),
  ];
  const exportRows: ReportExportCell[][] = [
    ...lines.map((r) => [
      r.name,
      r.unit,
      ...r.cells.flatMap((c) =>
        c
          ? [c.quantity, c.rate, (Number(c.quantity) || 0) * (Number(c.rate) || 0)]
          : [null, null, null]
      ),
    ]),
    ...(lines.length
      ? [
          [
            "Total",
            "",
            ...versions.flatMap((v) => ["", "", boqTotal(v.boq)]),
          ],
          [
            "Work order value",
            "",
            ...versions.flatMap((v) => ["", "", v.value]),
          ],
        ]
      : []),
  ];

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="max-w-xl">
        <ContractTypeahead
          contracts={contracts}
          value={contractId}
          onChange={setContractId}
          optionSuffix={(c) =>
            c.amendments.length
              ? `${c.amendments.length} amendment${c.amendments.length === 1 ? "" : "s"}`
              : "No amendments"
          }
        />
      </div>

      {!contract ? (
        <p className="rounded-lg border border-dashed border-[var(--fh-line)] px-4 py-8 text-center text-sm text-[var(--fh-muted)]">
          Select a contract to see its work order and amendments.
        </p>
      ) : (
        <>
          {!hasAmendments && (
            <p
              role="status"
              className="rounded-md border border-[var(--fh-accent)]/50 bg-[var(--fh-accent)]/10 px-3 py-2 text-sm font-medium text-[var(--fh-ink)]"
            >
              No amendment created for this contract.
            </p>
          )}
          <div
            data-hub-data-scroll=""
            className={cn(
              "min-h-0 w-full flex-1 rounded-lg border border-[var(--fh-line)] [scrollbar-gutter:stable]",
              versions.length > 3 ? "overflow-auto" : "overflow-x-hidden overflow-y-auto"
            )}
          >
            <table
              className="w-full table-fixed text-left text-sm"
              style={
                versions.length > 3
                  ? { minWidth: `${280 + versions.length * 220}px` }
                  : undefined
              }
            >
              <colgroup>
                <col style={{ width: hasAmendments ? "22%" : "40%" }} />
                <col style={{ width: hasAmendments ? "7%" : "12%" }} />
                {versions.flatMap((v) => [
                  <col key={`${v.key}-q`} />,
                  <col key={`${v.key}-r`} />,
                ])}
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--fh-line)]">
                  <th
                    rowSpan={2}
                    className={cn(th, "bg-[var(--fh-bg)] text-[var(--fh-muted)]")}
                  >
                    BOQ item
                  </th>
                  <th
                    rowSpan={2}
                    className={cn(th, "bg-[var(--fh-bg)] text-[var(--fh-muted)]")}
                  >
                    Unit
                  </th>
                  {versions.map((v) => (
                    <th
                      key={v.key}
                      colSpan={2}
                      className={cn(
                        "border-l border-[var(--fh-line)] px-2 py-2 align-top text-left font-normal normal-case",
                        v.kind === "wo"
                          ? "bg-[var(--fh-steel)] text-white"
                          : "bg-[var(--fh-accent)]/15 text-[var(--fh-ink)]"
                      )}
                    >
                      <VersionHeader version={v} contract={contract} />
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-[var(--fh-muted)]">
                  {versions.flatMap((v) => [
                    <th
                      key={`${v.key}-q`}
                      className={cn(th, "border-l border-[var(--fh-line)] text-right")}
                    >
                      Qty
                    </th>,
                    <th key={`${v.key}-r`} className={cn(th, "text-right")}>
                      Rate
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {lines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2 + versions.length * 2}
                      className="px-3 py-6 text-center text-[var(--fh-muted)]"
                    >
                      No BOQ items on this work order.
                    </td>
                  </tr>
                ) : (
                  lines.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>{r.name}</td>
                      <td className={cn(td, "text-[var(--fh-muted)]")}>{r.unit}</td>
                      {r.cells.flatMap((c, i) => {
                        const change = cellChange(r, i);
                        const tone = cellTone[change];
                        const k = versions[i].key;
                        if (!c) {
                          return [
                            <td
                              key={`${k}-q`}
                              colSpan={2}
                              className={cn(td, "border-l border-[var(--fh-line)] text-center text-xs", tone)}
                            >
                              {change === "removed" ? "Removed" : "—"}
                            </td>,
                          ];
                        }
                        return [
                          <td
                            key={`${k}-q`}
                            className={cn(num, "border-l border-[var(--fh-line)] font-medium", tone)}
                          >
                            {formatQty(c.quantity)}
                            {change === "added" && (
                              <span className="block text-[10px] font-normal uppercase tracking-wide">
                                Added
                              </span>
                            )}
                          </td>,
                          <td key={`${k}-r`} className={cn(num, tone)}>
                            {formatMoney(Number(c.rate) || 0)}
                          </td>,
                        ];
                      })}
                    </tr>
                  ))
                )}
              </tbody>
              {lines.length > 0 && (
                <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
                  <tr>
                    <td className={td} colSpan={2}>
                      BOQ total
                    </td>
                    {versions.map((v) => (
                      <td
                        key={v.key}
                        colSpan={2}
                        className={cn(num, "border-l border-[var(--fh-line)]")}
                      >
                        {formatMoney(boqTotal(v.boq))}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <ReportExportIcons
            filename={`amendments-${contract.projectNo}`}
            title="Other Reports — Amendments"
            filters={reportFilterSummary({
              tab: "Amendments",
              contract: `${contract.projectNo} · ${contract.projectName}`,
              extra: [
                ["WO no.", contract.orderNos],
                [
                  "Order date",
                  contract.orderDate ? formatDisplayDate(contract.orderDate) : "",
                ],
                ["Order value", formatMoney(versions[0].value)],
                [
                  "Amendments",
                  hasAmendments
                    ? versions
                        .slice(1)
                        .map(
                          (v) =>
                            `${v.label.replace("Amendment ", "")} (${formatDisplayDate(v.date)}, ${formatMoney(v.value)})`
                        )
                        .join(", ")
                    : "No amendment created",
                ],
              ],
            })}
            headers={exportHeaders}
            rows={exportRows}
          />
        </>
      )}
    </div>
  );
}

function VersionHeader({ version, contract }: { version: Version; contract: Contract }) {
  const muted = version.kind === "wo" ? "text-white/75" : "text-[var(--fh-muted)]";
  if (version.kind === "wo") {
    return (
      <div className="space-y-0.5 text-xs leading-snug sm:text-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fh-accent)]">
          Work order
        </p>
        <p className="font-semibold">
          {contract.projectName}{" "}
          <span className={cn("font-normal tabular-nums", muted)}>({contract.projectNo})</span>
        </p>
        {contract.orderNos ? (
          <p className="break-all">
            <span className={muted}>WO no. </span>
            {contract.orderNos}
          </p>
        ) : null}
        <p>
          <span className={muted}>Order date </span>
          <span className="tabular-nums">{formatDisplayDate(contract.orderDate)}</span>
        </p>
        <p>
          <span className={muted}>Order value </span>
          <span className="font-semibold tabular-nums">{formatMoney(version.value)}</span>
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-0.5 text-xs leading-snug sm:text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--fh-steel)]">
        Amendment
      </p>
      <p className="font-semibold">{version.label.replace("Amendment ", "No. ")}</p>
      <p>
        <span className={muted}>Date </span>
        <span className="tabular-nums">{formatDisplayDate(version.date)}</span>
      </p>
      <p>
        <span className={muted}>New WO value </span>
        <span className="font-semibold tabular-nums">{formatMoney(version.value)}</span>
      </p>
    </div>
  );
}
