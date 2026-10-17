"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import type { FlowhubData } from "@/lib/types";
import { SCHEDULE_KIND_LABELS } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate, isDateInInclusiveRange } from "@/lib/dates";
import {
  SCHEDULE_FULFILMENT_LABELS,
  WORKORDER_STATUS_LABELS,
  buildExecutionSummaryRows,
  buildItemListRows,
  buildProjectTaskRows,
  buildScheduleFulfilmentRows,
  buildSupplyDetailRows,
  buildWorkorderRows,
  formatQty,
  itemListCities,
  itemListExportRow,
  itemListHeaders,
  type ScheduleFulfilmentStatus,
  type WorkorderStatus,
} from "@/lib/execution-reports";
import { matchesAny } from "@/lib/list-search";
import { confirmAction } from "@/components/confirm-panel";
import { EditIconButton } from "@/components/icon-actions";
import { itemNameChoices } from "@/lib/item-rename";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import { deleteDeliveryChallan, flushWorkspace, renameItem } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSearchWithDateRange } from "@/components/list-date-range";
import { ListSearchBar } from "@/components/list-search";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { cn } from "@/lib/utils";
import { AmendmentsPanel } from "../other/amendments-panel";
import {
  ReportsTableScroll,
  reportMoney,
  reportTd,
  reportTh,
} from "../reports-shell";
import {
  FormMessage,
  SegmentButton,
  StatusPill,
  qtyCell,
} from "./execution-ui";

const theadClass =
  "border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]";

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-6 text-center text-[var(--fh-muted)]">
        {text}
      </td>
    </tr>
  );
}

function fulfilmentTone(s: ScheduleFulfilmentStatus): "muted" | "warn" | "ok" {
  if (s === "pending") return "muted";
  if (s === "partially_supplied" || s === "partially_installed") return "warn";
  return "ok";
}

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function commitmentLabel(committed: boolean) {
  return committed ? "Committed" : "Uncommitted";
}

function qtyWithUnit(qty: number, unit: string) {
  return unit ? `${formatQty(qty)} ${unit}` : formatQty(qty);
}

export function SchedulesTab({ data }: { data: FlowhubData }) {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const all = useMemo(() => buildScheduleFulfilmentRows(data), [data]);
  const rows = useMemo(() => {
    const today = todayIso();
    return all.filter((r) => {
      if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
      const incomplete =
        r.status === "pending" ||
        r.status === "partially_supplied" ||
        r.status === "partially_installed";
      const overdue =
        incomplete && !!r.date && r.date < today ? "overdue" : null;
      return matchesAny(q, [
        r.projectNo,
        r.projectName,
        r.city,
        r.itemName,
        r.kind,
        SCHEDULE_KIND_LABELS[r.kind],
        r.date,
        formatDisplayDate(r.date),
        commitmentLabel(r.committed),
        r.status,
        SCHEDULE_FULFILMENT_LABELS[r.status],
        overdue,
      ]);
    });
  }, [all, q, dateFrom, dateTo]);

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <ListSearchWithDateRange
        className="mt-0"
        value={q}
        onChange={setQ}
        placeholder="Search project, city, item, type, commitment, status…"
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[9%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={reportTh}>Type</th>
              <th className={reportTh}>Item</th>
              <th className={cn(reportTh, "text-right")}>Qty</th>
              <th className={reportTh}>Date</th>
              <th className={reportTh}>Commitment status</th>
              <th className={cn(reportTh, "text-right")}>Qty completed</th>
              <th className={reportTh}>Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow
                colSpan={9}
                text={
                  all.length === 0
                    ? "No supply / installation schedule lines yet."
                    : "No matching schedule lines."
                }
              />
            ) : (
              rows.map((r) => (
                <tr key={r.scheduleId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "text-[var(--fh-muted)]")}>
                    {r.city || "—"}
                  </td>
                  <td className={reportTd}>{SCHEDULE_KIND_LABELS[r.kind]}</td>
                  <td className={reportTd}>{r.itemName}</td>
                  <td className={qtyCell}>{qtyWithUnit(r.plannedQty, r.unit)}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {r.date ? formatDisplayDate(r.date) : "NA"}
                  </td>
                  <td className={reportTd}>
                    <StatusPill
                      label={commitmentLabel(r.committed)}
                      tone={r.committed ? "ok" : "muted"}
                    />
                  </td>
                  <td className={cn(qtyCell, "font-medium")}>
                    {qtyWithUnit(r.actualQty, r.unit)}
                  </td>
                  <td className={reportTd}>
                    <StatusPill
                      label={SCHEDULE_FULFILMENT_LABELS[r.status]}
                      tone={fulfilmentTone(r.status)}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="execution-schedules"
        title="Operations — Schedules"
        filters={reportFilterSummary({
          tab: "Schedules",
          search: q,
          dateFrom,
          dateTo,
          dateLabel: "Start date",
        })}
        headers={[
          "Project",
          "Project no.",
          "City",
          "Type",
          "Item",
          "Qty",
          "Unit",
          "Date",
          "Commitment status",
          "Qty completed",
          "Status",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.city,
          SCHEDULE_KIND_LABELS[r.kind],
          r.itemName,
          r.plannedQty,
          r.unit,
          r.date ? formatDisplayDate(r.date) : "NA",
          commitmentLabel(r.committed),
          r.actualQty,
          SCHEDULE_FULFILMENT_LABELS[r.status],
        ])}
      />
    </div>
  );
}

export function SummaryTab({ data }: { data: FlowhubData }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => buildExecutionSummaryRows(data), [data]);
  const rows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) =>
      matchesAny(needle, [r.projectNo, r.projectName, r.itemName, r.unit])
    );
  }, [all, q]);

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <ListSearchBar
        className="mt-0"
        value={q}
        onChange={setQ}
        placeholder="Search project, item…"
      />
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[26%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>Item</th>
              <th className={cn(reportTh, "text-right")}>BOQ qty</th>
              <th className={cn(reportTh, "text-right")}>Supplied</th>
              <th className={cn(reportTh, "text-right")}>Installed</th>
              <th className={cn(reportTh, "text-right")}>Left to supply</th>
              <th className={cn(reportTh, "text-right")}>
                Left for installation
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow
                colSpan={7}
                text={all.length === 0 ? "No BOQ items yet." : "No matching items."}
              />
            ) : (
              rows.map((r) => (
                <tr key={`${r.contractId}-${r.boqItemId}`}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={reportTd}>
                    {r.itemName}
                    {r.unit ? (
                      <span className="block text-xs text-[var(--fh-muted)]">
                        {r.unit}
                      </span>
                    ) : null}
                  </td>
                  <td className={qtyCell}>{formatQty(r.boqQty)}</td>
                  <td className={qtyCell}>{formatQty(r.supplied)}</td>
                  <td className={qtyCell}>{formatQty(r.installed)}</td>
                  <td
                    className={cn(
                      qtyCell,
                      r.leftToSupply > 0 && "font-medium text-[var(--fh-steel)]"
                    )}
                  >
                    {formatQty(r.leftToSupply)}
                  </td>
                  <td
                    className={cn(
                      qtyCell,
                      r.leftToInstall > 0 && "font-medium text-[var(--fh-steel)]"
                    )}
                  >
                    {formatQty(r.leftToInstall)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="execution-summary"
        title="Operations — Execution summary"
        filters={reportFilterSummary({ tab: "Summary", search: q })}
        headers={[
          "Project",
          "Project no.",
          "Item",
          "Unit",
          "BOQ qty",
          "Supplied",
          "Installed",
          "Left to supply",
          "Left for installation",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.itemName,
          r.unit,
          r.boqQty,
          r.supplied,
          r.installed,
          r.leftToSupply,
          r.leftToInstall,
        ])}
      />
    </div>
  );
}

export function ItemListTab({
  data,
  canRename = false,
}: {
  data: FlowhubData;
  canRename?: boolean;
}) {
  const [q, setQ] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [savingRename, setSavingRename] = useState(false);
  const units = useMemo(() => {
    const map = new Map<string, string>();
    for (const choice of itemNameChoices(data)) {
      map.set(choice.name.trim().toLowerCase(), choice.unit.trim() || "Nos");
    }
    return map;
  }, [data]);
  const cities = useMemo(() => itemListCities(data), [data]);
  const headers = useMemo(() => itemListHeaders(cities), [cities]);
  const all = useMemo(() => buildItemListRows(data), [data]);
  const rows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) =>
      matchesAny(needle, [
        r.itemName,
        r.totalQty,
        formatQty(r.totalQty),
        r.totalSupplied,
        formatQty(r.totalSupplied),
        r.leftForSupply,
        formatQty(r.leftForSupply),
        ...cities.flatMap((city) => {
          const cell = r.byCity[city];
          if (!cell) return [];
          return [city, cell.leftForSupply, formatQty(cell.leftForSupply)];
        }),
      ])
    );
  }, [all, cities, q]);
  const colCount = headers.length;

  function startRename(key: string, itemName: string) {
    setEditingKey(key);
    setDraft(itemName);
    setUnitDraft(units.get(key) || "Nos");
    setRenameError(null);
  }

  function cancelRename() {
    setEditingKey(null);
    setDraft("");
    setUnitDraft("");
    setRenameError(null);
  }

  async function saveRename(event: FormEvent, itemName: string, unit: string) {
    event.preventDefault();
    const next = draft.trim();
    const nextUnit = unitDraft.trim();
    if (!next) {
      setRenameError("Enter a new item name.");
      return;
    }
    if (!nextUnit) {
      setRenameError("Enter a unit.");
      return;
    }
    if (next === itemName && nextUnit === unit) {
      cancelRename();
      return;
    }
    setSavingRename(true);
    const result = renameItem(itemName, next, nextUnit);
    if (!result.ok) {
      setSavingRename(false);
      setRenameError(result.error);
      return;
    }
    const saved = await confirmWorkspaceSave();
    setSavingRename(false);
    if (!saved) return;
    cancelRename();
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <ListSearchBar
        className="mt-0"
        value={q}
        onChange={setQ}
        placeholder="Search item, city…"
      />
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col
              style={{
                width: cities.length === 0 ? "40%" : canRename ? "24%" : "18%",
              }}
            />
            <col style={{ width: cities.length === 0 ? "20%" : "12%" }} />
            {cities.map((city) => (
              <col key={city} />
            ))}
            <col style={{ width: cities.length === 0 ? "20%" : "12%" }} />
            <col style={{ width: cities.length === 0 ? "20%" : "13%" }} />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              {headers.map((header, i) => (
                <th
                  key={`${i}-${header}`}
                  className={cn(reportTh, i > 0 && "text-right")}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow
                colSpan={colCount}
                text={
                  all.length === 0
                    ? "No BOQ items on Active contracts."
                    : "No matching items."
                }
              />
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className={reportTd}>
                    {canRename && editingKey === r.key ? (
                      <form
                        className="space-y-1"
                        onSubmit={(event) =>
                          void saveRename(event, r.itemName, units.get(r.key) || "Nos")
                        }
                      >
                        <div className="flex gap-1">
                          <Input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            aria-label={`New name for ${r.itemName}`}
                            className="h-8 min-w-0 flex-1"
                            autoFocus
                          />
                          <Input
                            value={unitDraft}
                            onChange={(event) => setUnitDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelRename();
                              }
                            }}
                            aria-label={`Unit for ${r.itemName}`}
                            className="h-8 w-16 shrink-0"
                          />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={savingRename}
                          >
                            {savingRename ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={cancelRename}
                            disabled={savingRename}
                          >
                            Cancel
                          </Button>
                        </div>
                        {renameError && (
                          <p role="alert" className="text-xs text-[var(--destructive)]">
                            {renameError}
                          </p>
                        )}
                      </form>
                    ) : canRename ? (
                      <div className="flex items-start gap-1">
                        <span className="min-w-0 break-words">{r.itemName}</span>
                        <span className="shrink-0 text-[var(--fh-muted)]">
                          {units.get(r.key) || "Nos"}
                        </span>
                        <EditIconButton
                          label={`Edit name and unit for ${r.itemName}`}
                          onClick={() => startRename(r.key, r.itemName)}
                          className="shrink-0"
                        />
                      </div>
                    ) : (
                      r.itemName
                    )}
                  </td>
                  <td className={qtyCell}>{formatQty(r.totalQty)}</td>
                  {cities.map((city) => {
                    const cell = r.byCity[city];
                    return (
                      <td key={city} className={qtyCell}>
                        {cell ? formatQty(cell.leftForSupply) : null}
                      </td>
                    );
                  })}
                  <td className={qtyCell}>{formatQty(r.totalSupplied)}</td>
                  <td className={qtyCell}>{formatQty(r.leftForSupply)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="execution-item-list"
        title="Operations — Item list"
        filters={reportFilterSummary({ tab: "Item list", search: q })}
        headers={headers}
        rows={rows.map((r) => itemListExportRow(cities, r))}
      />
    </div>
  );
}

export type OtherSub = "workorders" | "tasks" | "amendments";

const OTHER_SUBS: { id: OtherSub; label: string }[] = [
  { id: "workorders", label: "Workorders summary" },
  { id: "tasks", label: "Tasks" },
  { id: "amendments", label: "Amendments" },
];

/** Workorders + Tasks rollups (Reports → Other reports page). */
export function OtherReportsPanels({
  data,
  sub,
  onSubChange,
}: {
  data: FlowhubData;
  sub: OtherSub;
  onSubChange: (s: OtherSub) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        role="tablist"
        aria-label="Other reports"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
      >
        {OTHER_SUBS.map((s) => (
          <SegmentButton
            key={s.id}
            size="sm"
            active={sub === s.id}
            onClick={() => onSubChange(s.id)}
            label={s.label}
          />
        ))}
      </div>
      {sub === "workorders" && <WorkordersTable data={data} />}
      {sub === "tasks" && <TasksTable data={data} />}
      {sub === "amendments" && <AmendmentsPanel data={data} />}
    </div>
  );
}

/** Saved delivery challans — one row per DC line. DCs are added on Dispatch. */
export function DcRecordsTab({
  data,
  canEdit,
}: {
  data: FlowhubData;
  canEdit: boolean;
}) {
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
      <h3 className="shrink-0 font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
        DC records
      </h3>
      <DcRecordsTable data={data} canEdit={canEdit} />
    </div>
  );
}

function workorderTone(s: WorkorderStatus): "muted" | "warn" | "ok" {
  if (s === "completed") return "ok";
  if (s === "on_hold") return "warn";
  return "muted";
}

function WorkordersTable({ data }: { data: FlowhubData }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => buildWorkorderRows(data), [data]);
  const rows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) =>
      matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.city,
        r.woNo,
        r.woDate,
        formatDisplayDate(r.woDate),
        r.woValue,
        WORKORDER_STATUS_LABELS[r.status],
        formatDisplayDate(r.handoverDate),
        formatDisplayDate(r.dlpEndDate),
        r.latestAmendmentNo,
        formatDisplayDate(r.latestAmendmentDate),
      ])
    );
  }, [all, q]);

  return (
    <>
      <ListSearchBar
        className="mt-4"
        value={q}
        onChange={setQ}
        placeholder="Search project, city, WO no., status…"
      />
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={reportTh}>WO no.</th>
              <th className={reportTh}>WO date</th>
              <th className={cn(reportTh, "text-right")}>WO value</th>
              <th className={reportTh}>Amendments</th>
              <th className={reportTh}>Status</th>
              <th className={reportTh}>Handover</th>
              <th className={reportTh}>DLP end</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow colSpan={9} text="No matching workorders." />
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
                  <td className={reportTd}>{r.city}</td>
                  <td className={cn(reportTd, "break-all")}>{r.woNo}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.woDate)}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.woValue)}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {r.amendmentCount === 0 ? (
                      <span className="text-[var(--fh-muted)]">—</span>
                    ) : (
                      <>
                        <span className="font-medium">{r.amendmentCount}</span>
                        <span className="block text-xs text-[var(--fh-muted)]">
                          {r.latestAmendmentNo} ·{" "}
                          {formatDisplayDate(r.latestAmendmentDate)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={reportTd}>
                    <StatusPill
                      label={WORKORDER_STATUS_LABELS[r.status]}
                      tone={workorderTone(r.status)}
                    />
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.handoverDate)}
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.dlpEndDate)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="workorders-summary"
        title="Other Reports — Workorders summary"
        filters={reportFilterSummary({ tab: "Workorders summary", search: q })}
        headers={[
          "Project",
          "Project no.",
          "City",
          "WO no.",
          "WO date",
          "WO value",
          "Amendments",
          "Latest amendment",
          "Status",
          "Handover",
          "DLP end",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.city,
          r.woNo,
          formatDisplayDate(r.woDate),
          r.woValue,
          r.amendmentCount,
          r.amendmentCount === 0
            ? ""
            : `${r.latestAmendmentNo} · ${formatDisplayDate(r.latestAmendmentDate)}`,
          WORKORDER_STATUS_LABELS[r.status],
          formatDisplayDate(r.handoverDate),
          formatDisplayDate(r.dlpEndDate),
        ])}
      />
    </>
  );
}

function TasksTable({ data }: { data: FlowhubData }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => buildProjectTaskRows(data), [data]);
  const rows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return all;
    return all.filter((r) => matchesAny(needle, [r.projectNo, r.projectName]));
  }, [all, q]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          created: t.created + r.created,
          completed: t.completed + r.completed,
          open: t.open + r.open,
          overdue: t.overdue + r.overdue,
        }),
        { created: 0, completed: 0, open: 0, overdue: 0 }
      ),
    [rows]
  );

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
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className={theadClass}>
            <tr>
              <th className={reportTh}>Project</th>
              <th className={cn(reportTh, "text-right")}>Created</th>
              <th className={cn(reportTh, "text-right")}>Completed</th>
              <th className={cn(reportTh, "text-right")}>Open</th>
              <th className={cn(reportTh, "text-right")}>Overdue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow colSpan={5} text="No matching projects." />
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
                  <td className={qtyCell}>{r.created}</td>
                  <td className={qtyCell}>{r.completed}</td>
                  <td className={qtyCell}>{r.open}</td>
                  <td
                    className={cn(
                      qtyCell,
                      r.overdue > 0 && "font-medium text-[var(--destructive)]"
                    )}
                  >
                    {r.overdue}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
              <tr>
                <td className={reportTd}>Total</td>
                <td className={qtyCell}>{totals.created}</td>
                <td className={qtyCell}>{totals.completed}</td>
                <td className={qtyCell}>{totals.open}</td>
                <td className={qtyCell}>{totals.overdue}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="tasks-by-project"
        title="Other Reports — Tasks by project"
        filters={reportFilterSummary({ tab: "Tasks", search: q })}
        headers={["Project", "Project no.", "Created", "Completed", "Open", "Overdue"]}
        rows={[
          ...rows.map((r) => [
            r.projectName,
            r.projectNo,
            r.created,
            r.completed,
            r.open,
            r.overdue,
          ]),
          ...(rows.length > 0
            ? [["Total", "", totals.created, totals.completed, totals.open, totals.overdue]]
            : []),
        ]}
      />
    </>
  );
}

type Msg = { kind: "ok" | "error"; text: string } | null;

function DcRecordsTable({
  data,
  canEdit,
}: {
  data: FlowhubData;
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const all = useMemo(() => buildSupplyDetailRows(data), [data]);
  const createdBy = useMemo(
    () => new Map(data.deliveryChallans.map((dc) => [dc.id, dc.createdBy])),
    [data.deliveryChallans]
  );
  const rows = useMemo(() => {
    const needle = q.trim();
    return all.filter((r) => {
      if (!isDateInInclusiveRange(r.dcDate, dateFrom, dateTo)) return false;
      return matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.dcNo,
        r.dcDate,
        formatDisplayDate(r.dcDate),
        r.itemName,
        r.qty,
        createdBy.get(r.dcId),
      ]);
    });
  }, [all, q, dateFrom, dateTo, createdBy]);
  /** Delete sits on the first visible line of each DC. */
  const firstLineKeys = useMemo(() => {
    const seen = new Set<string>();
    const keys = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.dcId)) continue;
      seen.add(r.dcId);
      keys.add(r.key);
    }
    return keys;
  }, [rows]);

  async function onDelete(id: string, dcNo: string) {
    if (
      !(await confirmAction({
        message: `Delete DC ${dcNo}? This cannot be undone.`,
        action: "Delete",
      }))
    ) {
      return;
    }
    const res = deleteDeliveryChallan(id);
    if (!res.ok) {
      setMsg({ kind: "error", text: res.error });
      return;
    }
    await flushWorkspace();
    setMsg({ kind: "ok", text: `Deleted DC ${dcNo}.` });
  }

  return (
    <>
      <ListSearchWithDateRange
        className="mt-2"
        value={q}
        onChange={setQ}
        placeholder="Search project, DC no., item…"
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />
      {msg && (
        <div className="mt-3">
          <FormMessage msg={msg} />
        </div>
      )}
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className={canEdit ? "w-[24%]" : "w-[26%]"} />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className={canEdit ? "w-[25%]" : "w-[27%]"} />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            {canEdit && <col className="w-[4%]" />}
          </colgroup>
          <thead className={theadClass}>
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>DC no.</th>
              <th className={reportTh}>DC date</th>
              <th className={reportTh}>Item</th>
              <th className={cn(reportTh, "text-right")}>Qty supplied</th>
              <th className={reportTh}>By</th>
              {canEdit && (
                <th className={reportTh}>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <EmptyRow
                colSpan={canEdit ? 7 : 6}
                text={all.length === 0 ? "No DCs recorded yet." : "No matching DC lines."}
              />
            ) : (
              rows.map((r) => (
                <tr key={r.key}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "break-all font-medium")}>
                    {r.dcNo || "—"}
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.dcDate)}
                  </td>
                  <td className={reportTd}>{r.itemName}</td>
                  <td className={qtyCell}>{formatQty(r.qty)}</td>
                  <td className={cn(reportTd, "text-xs text-[var(--fh-muted)]")}>
                    {createdBy.get(r.dcId) || "—"}
                  </td>
                  {canEdit && (
                    <td className="px-1 py-2 align-top">
                      {firstLineKeys.has(r.key) && (
                        <button
                          type="button"
                          onClick={() => void onDelete(r.dcId, r.dcNo)}
                          className="rounded p-1 text-[var(--fh-muted)] hover:bg-[var(--fh-bg)] hover:text-[var(--destructive)]"
                          aria-label={`Delete DC ${r.dcNo}`}
                          title="Delete DC (all lines)"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="dc-records"
        title="Operations — DC records"
        filters={reportFilterSummary({
          tab: "DC records",
          search: q,
          dateFrom,
          dateTo,
          dateLabel: "DC date",
        })}
        headers={["Project", "Project no.", "DC no.", "DC date", "Item", "Qty supplied", "By"]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.dcNo,
          formatDisplayDate(r.dcDate),
          r.itemName,
          r.qty,
          createdBy.get(r.dcId) ?? "",
        ])}
      />
    </>
  );
}
