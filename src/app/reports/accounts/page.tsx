"use client";

import { Suspense, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useViewQuery } from "@/lib/use-view-query";
import { useSession } from "next-auth/react";
import {
  flushWorkspace,
  updateContract,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import {
  BANK_GUARANTEE_EXPORT_HEADERS,
  COLLECTION_EXPORT_HEADERS,
  EXPENSE_REPORT_EXPORT_HEADERS,
  RETENTION_EXPORT_HEADERS,
  bankGuaranteeExportRow,
  buildBankGuaranteeRows,
  buildCollectionRows,
  buildExpenseReportRows,
  buildRetentionHeldRows,
  collectionExportRow,
  expenseReportExportRow,
  filterBankGuaranteeRows,
  filterCollectionRows,
  filterExpenseReportRows,
  filterRetentionHeldRows,
  retentionExportRow,
  sumCollectionColumns,
  type BankGuaranteeRow,
  type CollectionColumnTotals,
  type CollectionReportRow,
  type ExpenseReportRow,
  type RetentionHeldRow,
} from "@/lib/reports";
import { ListSearchWithDateRange } from "@/components/list-date-range";
import { ListSearchBar } from "@/components/list-search";
import { ListWindowNote } from "@/components/list-window-note";
import {
  LIST_WINDOW_ORDER,
  listIsFiltered,
  wholeUntilFiltered,
  windowList,
} from "@/lib/list-window";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canMarkRetentionRecovered } from "@/lib/types";
import { HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";
import {
  ReportsEmpty,
  ReportsHeader,
  ReportsLoading,
  ReportsTableScroll,
  reportPanelClass,
  reportMoney,
  reportTd,
  reportTh,
} from "../reports-shell";

type Tab = "collections" | "guarantees" | "retentions" | "expenses";

function parseTab(raw: string): Tab {
  if (raw === "guarantees") return "guarantees";
  if (raw === "retentions") return "retentions";
  if (raw === "expenses") return "expenses";
  return "collections";
}

export default function AccountsReportPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <AccountsReportInner />
    </Suspense>
  );
}

function AccountsReportInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { data: session } = useSession();
  const canRecover = canMarkRetentionRecovered(session?.user?.clearance);
  const { get, commit } = useViewQuery();
  const tab = parseTab(get("tab"));
  const q = get("q");
  const collectionFrom = get("cfrom");
  const collectionTo = get("cto");
  const dateFrom = get("from");
  const dateTo = get("to");
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [recoverDate, setRecoverDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function selectTab(next: Tab) {
    setMsg(null);
    setRecoveringId(null);
    commit({ tab: next === "collections" ? null : next });
  }

  function setQ(value: string) {
    commit({ q: value || null });
  }

  function setCollectionFrom(value: string) {
    commit({ cfrom: value || null });
  }

  function setCollectionTo(value: string) {
    commit({ cto: value || null });
  }

  function setDateFrom(value: string) {
    commit({ from: value || null });
  }

  function setDateTo(value: string) {
    commit({ to: value || null });
  }

  const allCollectionRows = useMemo(() => buildCollectionRows(data), [data]);
  const allBgRows = useMemo(() => buildBankGuaranteeRows(data), [data]);
  const allRetentionRows = useMemo(() => buildRetentionHeldRows(data), [data]);
  const allExpenseRows = useMemo(() => buildExpenseReportRows(data), [data]);

  const collectionFiltered = listIsFiltered({
    search: q,
    from: collectionFrom,
    to: collectionTo,
  });
  const collectionMatched = useMemo(
    () =>
      filterCollectionRows(allCollectionRows, {
        q,
        dateFrom: collectionFrom,
        dateTo: collectionTo,
      }),
    [allCollectionRows, q, collectionFrom, collectionTo]
  );
  const collectionWindow = useMemo(
    () =>
      windowList(collectionMatched, {
        filtered: collectionFiltered,
        order: LIST_WINDOW_ORDER.collections,
        date: (row) => row.date,
      }),
    [collectionMatched, collectionFiltered]
  );
  const collectionRows = collectionWindow.rows;

  const bgRows = useMemo(
    () => filterBankGuaranteeRows(allBgRows, q),
    [allBgRows, q]
  );

  const retentionRows = useMemo(
    () => filterRetentionHeldRows(allRetentionRows, q),
    [allRetentionRows, q]
  );

  const expenseFiltered = listIsFiltered({
    search: q,
    from: dateFrom,
    to: dateTo,
  });
  const expenseMatched = useMemo(
    () =>
      filterExpenseReportRows(allExpenseRows, {
        q,
        dateFrom,
        dateTo,
      }),
    [allExpenseRows, q, dateFrom, dateTo]
  );
  const expenseWindow = useMemo(
    () =>
      windowList(expenseMatched, {
        filtered: expenseFiltered,
        order: LIST_WINDOW_ORDER.accountExpenses,
        date: (row) => row.date,
      }),
    [expenseMatched, expenseFiltered]
  );
  const expenseRows = expenseWindow.rows;

  const expenseTotal = wholeUntilFiltered(
    allExpenseRows.reduce((s, r) => s + r.amount, 0),
    expenseRows.reduce((s, r) => s + r.amount, 0),
    expenseFiltered
  );
  const collectionTotals = wholeUntilFiltered(
    sumCollectionColumns(allCollectionRows),
    sumCollectionColumns(collectionRows),
    collectionFiltered
  );
  const retentionTotal = useMemo(
    () => retentionRows.reduce((s, r) => s + r.retentionHeld, 0),
    [retentionRows]
  );

  async function markRetentionRecovered(
    e: FormEvent,
    contractId: string
  ) {
    e.preventDefault();
    if (!canRecover) return;
    if (!recoverDate) {
      setMsg("Enter the retention recovery date.");
      return;
    }
    updateContract(contractId, { retentionRecoveredAt: recoverDate });
    await flushWorkspace();
    setRecoveringId(null);
    setRecoverDate("");
    setMsg(`Retention marked recovered on ${recoverDate}.`);
  }

  const emptyForTab =
    tab === "collections"
      ? allCollectionRows.length === 0
      : tab === "guarantees"
        ? allBgRows.length === 0
        : tab === "retentions"
          ? allRetentionRows.length === 0
          : allExpenseRows.length === 0;

  return (
    <HubPage>
      <ReportsHeader title="Accounts" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : emptyForTab ? (
        <section className={reportPanelClass}>
          <TabBar tab={tab} onSelect={selectTab} />
          <ReportsEmpty
            message={
              tab === "collections"
                ? "No payments recorded yet."
                : tab === "guarantees"
                  ? "No bank guarantees with details entered yet."
                  : tab === "retentions"
                    ? "No retention held on payments yet."
                    : "No expenses recorded yet."
            }
          />
        </section>
      ) : (
        <section className={reportPanelClass}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TabBar tab={tab} onSelect={selectTab} />
            {tab === "collections" ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  SUM OF CASH RECEIVED
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                  {formatMoney(collectionTotals.cashReceived)}
                </p>
              </div>
            ) : null}
            {tab === "retentions" ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  Total held
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                  {formatMoney(retentionTotal)}
                </p>
              </div>
            ) : null}
            {tab === "expenses" ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  Total expenses
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                  {formatMoney(expenseTotal)}
                </p>
              </div>
            ) : null}
          </div>

          {msg ? (
            <p className="mt-3 rounded-md border border-[var(--fh-line)] bg-[var(--fh-bg)] px-3 py-2 text-sm text-[var(--fh-steel)]">
              {msg}
            </p>
          ) : null}

          {tab === "collections" || tab === "expenses" ? (
            <ListSearchWithDateRange
              value={q}
              onChange={setQ}
              placeholder={
                tab === "collections"
                  ? "Search date, contract, city, against, amounts…"
                  : "Search project, city, type, person, amount…"
              }
              dateFrom={tab === "collections" ? collectionFrom : dateFrom}
              dateTo={tab === "collections" ? collectionTo : dateTo}
              onDateFromChange={
                tab === "collections" ? setCollectionFrom : setDateFrom
              }
              onDateToChange={
                tab === "collections" ? setCollectionTo : setDateTo
              }
            />
          ) : (
            <ListSearchBar
              className="mt-4 max-w-xl"
              value={q}
              onChange={setQ}
              placeholder={
                tab === "guarantees"
                  ? "Search project, city, type, number, bank, status…"
                  : "Search project, city, status, amounts…"
              }
            />
          )}

          {tab === "collections" ? (
            <>
              <ListWindowNote
                capped={collectionWindow.capped}
                order={LIST_WINDOW_ORDER.collections}
                className="mt-3"
              />
              <CollectionsTable
                rows={collectionRows}
                totals={collectionTotals}
                filters={reportFilterSummary({
                  tab: "Collections",
                  search: q,
                  dateFrom: collectionFrom,
                  dateTo: collectionTo,
                  dateLabel: "Payment date",
                })}
              />
            </>
          ) : tab === "guarantees" ? (
            <GuaranteesTable
              rows={bgRows}
              filters={reportFilterSummary({ tab: "Bank guarantees", search: q })}
            />
          ) : tab === "retentions" ? (
            <RetentionsTable
              rows={retentionRows}
              filters={reportFilterSummary({ tab: "Retentions", search: q })}
              canRecover={canRecover}
              recoveringId={recoveringId}
              recoverDate={recoverDate}
              onStartRecover={(id) => {
                setRecoveringId(id);
                setRecoverDate("");
                setMsg(null);
              }}
              onCancelRecover={() => setRecoveringId(null)}
              onRecoverDateChange={setRecoverDate}
              onSubmitRecover={markRetentionRecovered}
            />
          ) : (
            <>
              <ListWindowNote
                capped={expenseWindow.capped}
                order={LIST_WINDOW_ORDER.accountExpenses}
                className="mt-3"
              />
              <ExpensesTable
                rows={expenseRows}
                filters={reportFilterSummary({
                  tab: "Expenses",
                  search: q,
                  dateFrom,
                  dateTo,
                  dateLabel: "Expense date",
                })}
              />
            </>
          )}
        </section>
      )}
    </HubPage>
  );
}

function TabBar({
  tab,
  onSelect,
}: {
  tab: Tab;
  onSelect: (t: Tab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Accounts report"
      className="flex flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
    >
      <TabButton
        active={tab === "collections"}
        onClick={() => onSelect("collections")}
        label="Collections"
      />
      <TabButton
        active={tab === "guarantees"}
        onClick={() => onSelect("guarantees")}
        label="Bank guarantees"
      />
      <TabButton
        active={tab === "retentions"}
        onClick={() => onSelect("retentions")}
        label="Retentions"
      />
      <TabButton
        active={tab === "expenses"}
        onClick={() => onSelect("expenses")}
        label="Expenses"
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-white font-medium text-[var(--fh-steel)] ring-1 ring-[var(--fh-line)]"
          : "text-[var(--fh-muted)] hover:text-[var(--fh-steel)]"
      )}
    >
      {label}
    </button>
  );
}

function CollectionsTable({
  rows,
  totals,
  filters,
}: {
  rows: CollectionReportRow[];
  totals: CollectionColumnTotals;
  filters: string;
}) {
  const exportRows = rows.map(collectionExportRow);
  const exportTotals = sumCollectionColumns(rows);
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[9%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[7%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>DATE</th>
              <th className={reportTh}>AGAINST</th>
              <th className={cn(reportTh, "text-right")}>CASH RECEIVED NET</th>
              <th className={cn(reportTh, "text-right")}>CASH RECEIVED GST</th>
              <th className={cn(reportTh, "text-right")}>CASH RECEIVED TOTAL</th>
              <th className={cn(reportTh, "text-right")}>RETENTION</th>
              <th className={cn(reportTh, "text-right")}>TDS</th>
              <th className={cn(reportTh, "text-right")}>OTHER DEDUCTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching payments.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.paymentId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={
                        r.contractId ? `/contracts/${r.contractId}` : undefined
                      }
                    />
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.date)}
                  </td>
                  <td className={cn(reportTd, "break-all")}>
                    {r.invoiceId ? (
                      <Link
                        href={`/billing/${r.invoiceId}`}
                        className="font-medium text-[var(--fh-steel)] hover:underline"
                      >
                        {r.against}
                      </Link>
                    ) : (
                      r.against
                    )}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.cashReceivedNet)}</td>
                  <td className={reportMoney}>{formatMoney(r.cashReceivedGst)}</td>
                  <td className={reportMoney}>{formatMoney(r.cashReceived)}</td>
                  <td className={reportMoney}>{formatMoney(r.retention)}</td>
                  <td className={reportMoney}>{formatMoney(r.tds)}</td>
                  <td className={reportMoney}>
                    {formatMoney(r.otherDeductions)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
              <tr>
                <td className={reportTd} colSpan={3}>
                  Total
                </td>
                <td className={reportMoney}>
                  {formatMoney(totals.cashReceivedNet)}
                </td>
                <td className={reportMoney}>
                  {formatMoney(totals.cashReceivedGst)}
                </td>
                <td className={reportMoney}>
                  {formatMoney(totals.cashReceived)}
                </td>
                <td className={reportMoney}>{formatMoney(totals.retention)}</td>
                <td className={reportMoney}>{formatMoney(totals.tds)}</td>
                <td className={reportMoney}>
                  {formatMoney(totals.otherDeductions)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="collections"
        title="Accounts Report — Collections"
        filters={filters}
        headers={[...COLLECTION_EXPORT_HEADERS]}
        rows={
          rows.length > 0
            ? [
                ...exportRows,
                [
                  "Total",
                  "",
                  "",
                  exportTotals.cashReceivedNet,
                  exportTotals.cashReceivedGst,
                  exportTotals.cashReceived,
                  exportTotals.retention,
                  exportTotals.tds,
                  exportTotals.otherDeductions,
                ],
              ]
            : exportRows
        }
      />
    </>
  );
}

function GuaranteesTable({
  rows,
  filters,
}: {
  rows: BankGuaranteeRow[];
  filters: string;
}) {
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[7%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>PROJECT</th>
              <th className={reportTh}>TYPE</th>
              <th className={reportTh}>GUARANTEE #</th>
              <th className={reportTh}>DATE</th>
              <th className={cn(reportTh, "text-right")}>VALUE</th>
              <th className={reportTh}>BANK</th>
              <th className={reportTh}>EXPIRY</th>
              <th className={reportTh}>STATUS</th>
              <th className={reportTh}>RETRIEVAL</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching guarantees.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={reportTd}>{r.type}</td>
                  <td className={cn(reportTd, "break-all")}>{r.number}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.date)}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.value)}</td>
                  <td className={cn(reportTd, "break-words")}>{r.bankName}</td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.expiry)}
                  </td>
                  <td className={reportTd}>
                    <BgStatusLabel status={r.status} />
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {r.retrievalDate
                      ? formatDisplayDate(r.retrievalDate)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="bank-guarantees"
        title="Accounts Report — Bank guarantees"
        filters={filters}
        headers={[...BANK_GUARANTEE_EXPORT_HEADERS]}
        rows={rows.map(bankGuaranteeExportRow)}
      />
    </>
  );
}

function BgStatusLabel({
  status,
}: {
  status: BankGuaranteeRow["status"];
}) {
  const label =
    status === "active"
      ? "Active"
      : status === "retrieved"
        ? "Retrieved"
        : "Expired";
  return (
    <span
      className={cn(
        status === "retrieved" && "text-emerald-800",
        status === "expired" && "font-medium text-red-700",
        status === "active" && "text-[var(--fh-steel)]"
      )}
    >
      {label}
    </span>
  );
}

function RetentionsTable({
  rows,
  filters,
  canRecover,
  recoveringId,
  recoverDate,
  onStartRecover,
  onCancelRecover,
  onRecoverDateChange,
  onSubmitRecover,
}: {
  rows: RetentionHeldRow[];
  filters: string;
  canRecover: boolean;
  recoveringId: string | null;
  recoverDate: string;
  onStartRecover: (id: string) => void;
  onCancelRecover: () => void;
  onRecoverDateChange: (v: string) => void;
  onSubmitRecover: (e: FormEvent, contractId: string) => void;
}) {
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[32%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>PROJECT</th>
              <th className={cn(reportTh, "text-right")}>RETENTION HELD</th>
              <th className={reportTh}>STATUS</th>
              <th className={reportTh}>ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching retentions.
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
                  <td className={cn(reportMoney, "font-medium")}>
                    {formatMoney(r.retentionHeld)}
                  </td>
                  <td className={reportTd}>
                    <RetentionStatusCell status={r.status} />
                  </td>
                  <td className={reportTd}>
                    {r.status.kind === "recovered" ? (
                      <span className="text-xs text-[var(--fh-muted)]">—</span>
                    ) : canRecover ? (
                      recoveringId === r.contractId ? (
                        <form
                          onSubmit={(e) => onSubmitRecover(e, r.contractId)}
                          {...entryRootProps}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <div className="space-y-1">
                            <Label className="text-xs">Recovery date</Label>
                            <Input
                              type="date"
                              value={recoverDate}
                              onChange={(e) =>
                                onRecoverDateChange(e.target.value)
                              }
                              required
                              className="h-8 w-[10.5rem]"
                            />
                          </div>
                          <Button
                            type="submit"
                            {...entrySaveProps}
                            size="sm"
                            className="bg-[var(--fh-steel)]"
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={onCancelRecover}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onStartRecover(r.contractId)}
                        >
                          Mark recovered
                        </Button>
                      )
                    ) : (
                      <Link
                        href={`/contracts/${r.contractId}#retention`}
                        className="text-xs text-[var(--fh-steel)] hover:underline"
                      >
                        Open contract
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="retentions"
        title="Accounts Report — Retentions held"
        filters={filters}
        headers={[...RETENTION_EXPORT_HEADERS]}
        rows={rows.map(retentionExportRow)}
      />
    </>
  );
}

function RetentionStatusCell({
  status,
}: {
  status: RetentionHeldRow["status"];
}) {
  if (status.kind === "recovered") {
    return (
      <span className="text-emerald-800">
        Recovered
        <span className="mt-0.5 block text-xs text-[var(--fh-muted)]">
          {formatDisplayDate(status.recoveredAt)}
        </span>
      </span>
    );
  }
  if (status.kind === "undue") {
    return <span className="text-[var(--fh-muted)]">Undue</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        status.daysUntilDue < 0 && "font-medium text-red-700"
      )}
    >
      Due in {status.daysUntilDue} days
    </span>
  );
}

function ExpensesTable({
  rows,
  filters,
}: {
  rows: ExpenseReportRow[];
  filters: string;
}) {
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[22%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>PROJECT</th>
              <th className={reportTh}>DATE</th>
              <th className={reportTh}>EXPENSE TYPE</th>
              <th className={reportTh}>EXPENSE PERSON</th>
              <th className={cn(reportTh, "text-right")}>AMOUNT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching expenses.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.expenseId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.date)}
                  </td>
                  <td className={cn(reportTd, "break-words")}>{r.category}</td>
                  <td className={cn(reportTd, "break-words")}>{r.personPaid}</td>
                  <td className={reportMoney}>{formatMoney(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="expenses"
        title="Accounts Report — Expenses"
        filters={filters}
        headers={[...EXPENSE_REPORT_EXPORT_HEADERS]}
        rows={rows.map(expenseReportExportRow)}
      />
    </>
  );
}
