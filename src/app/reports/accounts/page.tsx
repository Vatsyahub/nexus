"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  flushWorkspace,
  updateContract,
  useFlowhubData,
  useWorkspaceReady,
} from "@/lib/store";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate, isDateInInclusiveRange } from "@/lib/dates";
import {
  buildBankGuaranteeRows,
  buildExpenseReportRows,
  buildRetentionHeldRows,
  formatRetentionStatusLabel,
  type BankGuaranteeRow,
  type ExpenseReportRow,
  type RetentionHeldRow,
} from "@/lib/reports";
import { matchesAny } from "@/lib/list-search";
import { ListSearchWithDateRange } from "@/components/list-date-range";
import { ListSearchBar } from "@/components/list-search";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
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

type Tab = "guarantees" | "retentions" | "expenses";

function parseTab(raw: string | null): Tab {
  if (raw === "retentions") return "retentions";
  if (raw === "expenses") return "expenses";
  return "guarantees";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const [recoverDate, setRecoverDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    setMsg(null);
    setRecoveringId(null);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "guarantees") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const allBgRows = useMemo(() => buildBankGuaranteeRows(data), [data]);
  const allRetentionRows = useMemo(() => buildRetentionHeldRows(data), [data]);
  const allExpenseRows = useMemo(() => buildExpenseReportRows(data), [data]);

  const bgRows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return allBgRows;
    return allBgRows.filter((r) =>
      matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.type,
        r.number,
        r.bankName,
        r.status,
        r.value,
        formatDisplayDate(r.date),
        formatDisplayDate(r.expiry),
        r.retrievalDate ? formatDisplayDate(r.retrievalDate) : "",
      ])
    );
  }, [allBgRows, q]);

  const retentionRows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return allRetentionRows;
    return allRetentionRows.filter((r) =>
      matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.retentionHeld,
        formatRetentionStatusLabel(r.status),
        r.status.kind === "recovered"
          ? formatDisplayDate(r.status.recoveredAt)
          : "",
        r.handoverDate ? formatDisplayDate(r.handoverDate) : "",
      ])
    );
  }, [allRetentionRows, q]);

  const expenseRows = useMemo(() => {
    const needle = q.trim();
    return allExpenseRows.filter((r) => {
      if (!isDateInInclusiveRange(r.date, dateFrom, dateTo)) return false;
      if (!needle) return true;
      return matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.category,
        r.personPaid,
        r.amount,
        formatDisplayDate(r.date),
      ]);
    });
  }, [allExpenseRows, q, dateFrom, dateTo]);

  const expenseTotal = useMemo(
    () => expenseRows.reduce((s, r) => s + r.amount, 0),
    [expenseRows]
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
    tab === "guarantees"
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
              tab === "guarantees"
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

          {tab === "expenses" ? (
            <ListSearchWithDateRange
              value={q}
              onChange={setQ}
              placeholder="Search project, type, person, amount…"
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />
          ) : (
            <ListSearchBar
              className="mt-4 max-w-xl"
              value={q}
              onChange={setQ}
              placeholder={
                tab === "guarantees"
                  ? "Search project, type, number, bank, status…"
                  : "Search project, status, amounts…"
              }
            />
          )}

          {tab === "guarantees" ? (
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
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>Type</th>
              <th className={reportTh}>Guarantee #</th>
              <th className={reportTh}>Date</th>
              <th className={cn(reportTh, "text-right")}>Value</th>
              <th className={reportTh}>Bank</th>
              <th className={reportTh}>Expiry</th>
              <th className={reportTh}>Status</th>
              <th className={reportTh}>Retrieval</th>
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
        headers={[
          "Project",
          "Project no.",
          "Type",
          "Guarantee #",
          "Date",
          "Value",
          "Bank",
          "Expiry",
          "Status",
          "Retrieval",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.type,
          r.number,
          formatDisplayDate(r.date),
          r.value,
          r.bankName,
          formatDisplayDate(r.expiry),
          r.status === "active"
            ? "Active"
            : r.status === "retrieved"
              ? "Retrieved"
              : "Expired",
          r.retrievalDate ? formatDisplayDate(r.retrievalDate) : "",
        ])}
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
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={cn(reportTh, "text-right")}>Retention held</th>
              <th className={reportTh}>Status</th>
              <th className={reportTh}>Action</th>
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
        headers={["Project", "Project no.", "Retention held", "Status", "Recovered on"]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.retentionHeld,
          formatRetentionStatusLabel(r.status),
          r.status.kind === "recovered"
            ? formatDisplayDate(r.status.recoveredAt)
            : "",
        ])}
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
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>Date</th>
              <th className={reportTh}>Expense type</th>
              <th className={reportTh}>Expense person</th>
              <th className={cn(reportTh, "text-right")}>Amount</th>
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
        headers={[
          "Project",
          "Project no.",
          "Date",
          "Expense type",
          "Expense person",
          "Amount",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          formatDisplayDate(r.date),
          r.category,
          r.personPaid,
          r.amount,
        ])}
      />
    </>
  );
}
