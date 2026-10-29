"use client";

import { useMemo } from "react";
import { useViewQuery } from "@/lib/use-view-query";
import type { Contract, FlowhubData } from "@/lib/types";
import { boqTotal } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import {
  AMENDMENT_LIST_HEADERS,
  amendmentCellTone,
  amendmentLineColour,
  buildAmendmentLineRows,
  buildAmendmentListRows,
  buildAmendmentVersions,
  filterAmendmentListRows,
  type AmendmentFigure,
  type AmendmentLineColour,
  type AmendmentVersion,
} from "@/lib/amendments-report";
import { ListSearchBar } from "@/components/list-search";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
  type ReportExportCell,
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

const lineBackground: Record<AmendmentLineColour, string> = {
  yellow: "bg-amber-50",
  green: "bg-emerald-50",
  removal: "bg-red-50 text-red-800",
  unchanged: "",
};

function figureClass(
  colour: AmendmentLineColour,
  highlight: readonly AmendmentFigure[],
  figure: AmendmentFigure
): string {
  if (colour === "green") return "amendment-added-text";
  if (colour === "yellow" && highlight.includes(figure)) return "font-medium text-amber-900";
  return "";
}

export function AmendmentsPanel({ data }: { data: FlowhubData }) {
  const { get, commit, retreatSamePage } = useViewQuery();
  const query = get("q");
  const contractId = get("contract");

  function setQuery(value: string) {
    commit({ q: value || null });
  }

  function openContract(id: string) {
    commit({ contract: id }, "push");
  }

  function closeContract() {
    if (!retreatSamePage()) commit({ contract: null });
  }
  const listed = useMemo(
    () => buildAmendmentListRows(data.contracts),
    [data.contracts]
  );
  const rows = useMemo(
    () => filterAmendmentListRows(listed, query),
    [listed, query]
  );
  const contract =
    data.contracts.find(
      (row) => row.id === contractId && (row.amendments?.length ?? 0) > 0
    ) ?? null;

  if (!contract) {
    return (
      <AmendmentsList
        query={query}
        onQuery={setQuery}
        rows={rows}
        hasAny={listed.length > 0}
        onOpen={openContract}
      />
    );
  }

  return (
    <AmendmentDetails contract={contract} onBack={closeContract} />
  );
}

function AmendmentsList({
  query,
  onQuery,
  rows,
  hasAny,
  onOpen,
}: {
  query: string;
  onQuery: (value: string) => void;
  rows: ReturnType<typeof buildAmendmentListRows>;
  hasAny: boolean;
  onOpen: (contractId: string) => void;
}) {
  return (
    <>
      <ListSearchBar
        className="mt-4"
        value={query}
        onChange={onQuery}
        placeholder="Search project, city…"
      />
      <ReportsTableScroll className="mt-4">
        <table className="list-sticky-head w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              {AMENDMENT_LIST_HEADERS.map((header, index) => (
                <th
                  key={header}
                  className={cn(
                    reportTh,
                    (index === 3 || index === 5) && "text-right"
                  )}
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
                  colSpan={AMENDMENT_LIST_HEADERS.length}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  {hasAny ? "No matching contracts." : "No amendments."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.contractId}
                  className="cursor-pointer hover:bg-[var(--fh-bg)]"
                  tabIndex={0}
                  role="button"
                  aria-label={`${row.projectName} ${row.projectNo}`}
                  onClick={() => onOpen(row.contractId)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onOpen(row.contractId);
                  }}
                >
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={row.projectNo}
                      projectName={row.projectName}
                    />
                  </td>
                  <td className={reportTd}>{row.city || "—"}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(row.orderDate)}
                  </td>
                  <td className={reportMoney}>
                    {formatMoney(row.originalWorkOrderValue)}
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {row.amendmentCount}
                  </td>
                  <td className={reportMoney}>
                    {formatMoney(row.finalAmendmentValue)}
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(row.finalAmendmentDate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="amendments"
        title="Other Reports — Amendments"
        filters={reportFilterSummary({ tab: "Amendments", search: query })}
        headers={[...AMENDMENT_LIST_HEADERS]}
        rows={rows.map((row) => [
          `${row.projectName} (${row.projectNo})`,
          row.city,
          formatDisplayDate(row.orderDate),
          row.originalWorkOrderValue,
          row.amendmentCount,
          row.finalAmendmentValue,
          formatDisplayDate(row.finalAmendmentDate),
        ])}
      />
    </>
  );
}

function AmendmentDetails({
  contract,
  onBack,
}: {
  contract: Contract;
  onBack: () => void;
}) {
  const versions = useMemo(() => buildAmendmentVersions(contract), [contract]);
  const lines = useMemo(() => buildAmendmentLineRows(versions), [versions]);
  const hasAmendments = versions.length > 1;

  const exportHeaders = [
    "BOQ item",
    "Unit",
    ...versions.flatMap((version) => {
      const tag = `${version.kind === "wo" ? "WO" : version.label.replace("Amendment ", "")} (${formatDisplayDate(version.date)})`;
      return [`${tag} qty`, `${tag} rate`, `${tag} amount`];
    }),
  ];
  const exportRows: ReportExportCell[][] = [
    ...lines.map((row) => [
      row.name,
      row.unit,
      ...row.cells.flatMap((cell) =>
        cell
          ? [
              cell.quantity,
              cell.rate,
              (Number(cell.quantity) || 0) * (Number(cell.rate) || 0),
            ]
          : [null, null, null]
      ),
    ]),
    ...(lines.length
      ? [
          ["Total", "", ...versions.flatMap((version) => ["", "", boqTotal(version.boq)])],
          [
            "Work order value",
            "",
            ...versions.flatMap((version) => ["", "", version.value]),
          ],
        ]
      : []),
  ];

  const th =
    "px-2 py-1.5 align-bottom text-[10px] font-medium uppercase leading-tight tracking-wide sm:text-xs";
  const td = "px-2 py-1.5 align-top text-xs break-words sm:text-sm";
  const num = "px-2 py-1.5 text-right align-top text-xs tabular-nums sm:text-sm";

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[var(--fh-steel)] underline-offset-2 hover:underline"
        >
          All amendments
        </button>
      </div>
      <div
        data-hub-data-scroll=""
        className={cn(
          "min-h-0 w-full flex-1 rounded-lg border border-[var(--fh-line)] [scrollbar-gutter:stable]",
          versions.length > 3 ? "overflow-auto" : "overflow-x-hidden overflow-y-auto"
        )}
      >
        <table
          className="list-sticky-group w-full table-fixed text-left text-sm"
          style={
            versions.length > 3
              ? { minWidth: `${280 + versions.length * 220}px` }
              : undefined
          }
        >
          <colgroup>
            <col style={{ width: hasAmendments ? "22%" : "40%" }} />
            <col style={{ width: hasAmendments ? "7%" : "12%" }} />
            {versions.flatMap((version) => [
              <col key={`${version.key}-q`} />,
              <col key={`${version.key}-r`} />,
            ])}
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--fh-line)]">
              <th rowSpan={2} className={cn(th, "bg-[var(--fh-bg)] text-[var(--fh-muted)]")}>
                BOQ item
              </th>
              <th rowSpan={2} className={cn(th, "bg-[var(--fh-bg)] text-[var(--fh-muted)]")}>
                Unit
              </th>
              {versions.map((version) => (
                <th
                  key={version.key}
                  colSpan={2}
                  style={{
                    backgroundColor:
                      version.kind === "wo"
                        ? "var(--fh-steel)"
                        : "color-mix(in srgb, var(--fh-accent) 15%, white)",
                  }}
                  className={cn(
                    "border-l border-[var(--fh-line)] px-2 py-2 align-top text-left font-normal normal-case",
                    version.kind === "wo" ? "text-white" : "text-[var(--fh-ink)]"
                  )}
                >
                  <VersionHeader version={version} contract={contract} />
                </th>
              ))}
            </tr>
            <tr className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-[var(--fh-muted)]">
              {versions.flatMap((version) => [
                <th
                  key={`${version.key}-q`}
                  className={cn(th, "border-l border-[var(--fh-line)] text-right")}
                >
                  Qty
                </th>,
                <th key={`${version.key}-r`} className={cn(th, "text-right")}>
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
              lines.map((row) => (
                <tr key={row.key}>
                  <td className={td}>{row.name}</td>
                  <td className={cn(td, "text-[var(--fh-muted)]")}>{row.unit}</td>
                  {row.cells.flatMap((cell, index) => {
                    const tone = amendmentCellTone(row, index);
                    const colour = amendmentLineColour(tone);
                    const background = lineBackground[colour];
                    const versionKey = versions[index]?.key ?? String(index);
                    if (!cell) {
                      return [
                        <td
                          key={`${versionKey}-q`}
                          colSpan={2}
                          data-amendment-colour={colour}
                          className={cn(
                            td,
                            "border-l border-[var(--fh-line)] text-center text-xs",
                            background,
                            colour === "unchanged" && "text-[var(--fh-muted)]"
                          )}
                        >
                          {tone.line === "removed" ? "Removed" : "—"}
                        </td>,
                      ];
                    }
                    return [
                      <td
                        key={`${versionKey}-q`}
                        data-amendment-colour={colour}
                        data-highlight={tone.highlight.join(" ")}
                        className={cn(num, "border-l border-[var(--fh-line)]", background)}
                      >
                        <span
                          className={cn(
                            "font-medium",
                            figureClass(colour, tone.highlight, "quantity")
                          )}
                        >
                          {formatQty(cell.quantity)}
                        </span>
                        {tone.line === "added" && (
                          <span className="amendment-added-text block text-[10px] font-normal uppercase tracking-wide">
                            Added
                          </span>
                        )}
                      </td>,
                      <td
                        key={`${versionKey}-r`}
                        data-amendment-colour={colour}
                        className={cn(num, background)}
                      >
                        <span className={figureClass(colour, tone.highlight, "rate")}>
                          {formatMoney(Number(cell.rate) || 0)}
                        </span>
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
                {versions.map((version) => (
                  <td
                    key={version.key}
                    colSpan={2}
                    className={cn(num, "border-l border-[var(--fh-line)]")}
                  >
                    {formatMoney(boqTotal(version.boq))}
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
            ["Order date", contract.orderDate ? formatDisplayDate(contract.orderDate) : ""],
            ["Order value", formatMoney(versions[0]?.value ?? contract.orderValue)],
            [
              "Amendments",
              versions
                .slice(1)
                .map(
                  (version) =>
                    `${version.label.replace("Amendment ", "")} (${formatDisplayDate(version.date)}, ${formatMoney(version.value)})`
                )
                .join(", "),
            ],
          ],
        })}
        headers={exportHeaders}
        rows={exportRows}
      />
    </div>
  );
}

function VersionHeader({
  version,
  contract,
}: {
  version: AmendmentVersion;
  contract: Contract;
}) {
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
