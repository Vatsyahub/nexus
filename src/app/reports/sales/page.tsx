"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useViewQuery } from "@/lib/use-view-query";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import {
  SALES_CONTRACT_EXPORT_HEADERS,
  SALES_INVOICE_EXPORT_HEADERS,
  buildSalesContractRows,
  buildSalesInvoiceRows,
  filterSalesContractRows,
  filterSalesInvoiceRows,
  salesContractTotalExportRow,
  salesInvoiceExportRow,
  salesInvoiceTotalExportRow,
  sumSalesContractMoneyColumns,
  sumSalesInvoiceColumns,
  sumSalesInvoiceNet,
} from "@/lib/reports";
import { ListWindowNote } from "@/components/list-window-note";
import {
  LIST_WINDOW_ORDER,
  listIsFiltered,
  wholeUntilFiltered,
  windowList,
} from "@/lib/list-window";
import { ListSearchWithDateRange } from "@/components/list-date-range";
import { ProjectIdentity } from "@/components/project-identity";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
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

type Tab = "invoices" | "contracts";

function parseTab(raw: string): Tab {
  if (raw === "contracts") return "contracts";
  return "invoices";
}

export default function SalesReportPage() {
  return (
    <Suspense fallback={<ReportsLoading />}>
      <SalesReportInner />
    </Suspense>
  );
}

function SalesReportInner() {
  const data = useFlowhubData();
  const ready = useWorkspaceReady();
  const { get, commit } = useViewQuery();
  const tab = parseTab(get("tab"));
  const q = get("q");
  const dateFrom = get("from");
  const dateTo = get("to");

  function selectTab(next: Tab) {
    commit({ tab: next === "invoices" ? null : next });
  }

  function setQ(value: string) {
    commit({ q: value || null });
  }

  function setDateFrom(value: string) {
    commit({ from: value || null });
  }

  function setDateTo(value: string) {
    commit({ to: value || null });
  }

  const allInvoiceRows = useMemo(() => buildSalesInvoiceRows(data), [data]);
  const allContractRows = useMemo(() => buildSalesContractRows(data), [data]);

  const invoiceFiltered = listIsFiltered({
    search: q,
    from: dateFrom,
    to: dateTo,
  });
  const invoiceMatched = useMemo(
    () =>
      filterSalesInvoiceRows(allInvoiceRows, {
        q,
        dateFrom,
        dateTo,
      }),
    [allInvoiceRows, q, dateFrom, dateTo]
  );
  const invoiceWindow = useMemo(
    () =>
      windowList(invoiceMatched, {
        filtered: invoiceFiltered,
        order: LIST_WINDOW_ORDER.salesInvoices,
        date: (row) => row.date,
      }),
    [invoiceMatched, invoiceFiltered]
  );
  const invoiceRows = invoiceWindow.rows;

  const contractRows = useMemo(
    () => filterSalesContractRows(allContractRows, q),
    [allContractRows, q]
  );

  const netTotal = wholeUntilFiltered(
    sumSalesInvoiceNet(allInvoiceRows),
    sumSalesInvoiceNet(invoiceRows),
    invoiceFiltered
  );

  const contractOutstandingTotal = useMemo(
    () => contractRows.reduce((s, r) => s + r.totalOutstanding, 0),
    [contractRows]
  );
  const contractLeftoverTotal = useMemo(
    () => contractRows.reduce((s, r) => s + r.leftoverBilling, 0),
    [contractRows]
  );

  const showContracts = tab === "contracts";

  return (
    <HubPage>
      <ReportsHeader title="Sales" />

      {!ready ? (
        <ReportsLoading />
      ) : data.contracts.length === 0 ? (
        <ReportsEmpty message="No contracts yet." />
      ) : !showContracts && allInvoiceRows.length === 0 ? (
        <ReportsEmpty message="No tax invoices yet." />
      ) : (
        <section className={reportPanelClass}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div
              role="tablist"
              aria-label="Sales report"
              className="flex flex-wrap gap-1 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-1"
            >
              <TabButton
                active={tab === "invoices"}
                onClick={() => selectTab("invoices")}
                label="Invoices"
              />
              <TabButton
                active={tab === "contracts"}
                onClick={() => selectTab("contracts")}
                label="Contracts"
              />
            </div>
            {!showContracts ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                  SUM OF NET AMOUNT
                </p>
                <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                  {formatMoney(netTotal)}
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap justify-end gap-6 text-right">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                    Leftover billing
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                    {formatMoney(contractLeftoverTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                    Total outstanding
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                    {formatMoney(contractOutstandingTotal)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <ListSearchWithDateRange
            value={q}
            onChange={setQ}
            placeholder={
              showContracts
                ? "Search project, city, amounts…"
                : "Search project, city, invoice no., amounts…"
            }
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            showDateRange={!showContracts}
          />

          {showContracts ? (
            <ContractsTable
              rows={contractRows}
              filters={reportFilterSummary({ tab: "Contracts", search: q })}
            />
          ) : (
            <>
              <ListWindowNote
                capped={invoiceWindow.capped}
                order={LIST_WINDOW_ORDER.salesInvoices}
                className="mt-3"
              />
              <InvoicesTable
                rows={invoiceRows}
                filters={reportFilterSummary({
                  tab: "Invoices",
                  search: q,
                  dateFrom,
                  dateTo,
                  dateLabel: "Invoice date",
                })}
              />
            </>
          )}
        </section>
      )}
    </HubPage>
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

function InvoicesTable({
  rows,
  filters,
}: {
  rows: ReturnType<typeof buildSalesInvoiceRows>;
  filters: string;
}) {
  const totals = sumSalesInvoiceColumns(rows);
  const exportRows = rows.map(salesInvoiceExportRow);
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[12.5%]" />
            <col className="w-[12.5%]" />
            <col className="w-[12.5%]" />
            <col className="w-[12.5%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>Invoice no.</th>
              <th className={reportTh}>Invoice date</th>
              <th className={cn(reportTh, "text-right")}>Net amount</th>
              <th className={cn(reportTh, "text-right")}>GST amount</th>
              <th className={cn(reportTh, "text-right")}>Other amount</th>
              <th className={cn(reportTh, "text-right")}>Total amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching invoices.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.invoiceId}>
                  <td className={reportTd}>
                    <ProjectIdentity
                      projectNo={r.projectNo}
                      projectName={r.projectName}
                      href={`/contracts/${r.contractId}`}
                    />
                  </td>
                  <td className={cn(reportTd, "break-all")}>
                    <Link
                      href={`/billing/${r.invoiceId}`}
                      className="font-medium text-[var(--fh-steel)] hover:underline"
                    >
                      {r.number}
                    </Link>
                  </td>
                  <td className={cn(reportTd, "tabular-nums")}>
                    {formatDisplayDate(r.date)}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.net)}</td>
                  <td className={reportMoney}>{formatMoney(r.gst)}</td>
                  <td className={reportMoney}>{formatMoney(r.other)}</td>
                  <td className={cn(reportMoney, "font-medium")}>
                    {formatMoney(r.total)}
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
                <td className={reportMoney}>{formatMoney(totals.net)}</td>
                <td className={reportMoney}>{formatMoney(totals.gst)}</td>
                <td className={reportMoney}>{formatMoney(totals.other)}</td>
                <td className={reportMoney}>{formatMoney(totals.total)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="sales-invoices"
        title="Sales Report — Invoices"
        filters={filters}
        headers={[...SALES_INVOICE_EXPORT_HEADERS]}
        rows={
          rows.length > 0
            ? [...exportRows, salesInvoiceTotalExportRow(totals)]
            : exportRows
        }
      />
    </>
  );
}

function ContractsTable({
  rows,
  filters,
}: {
  rows: ReturnType<typeof buildSalesContractRows>;
  filters: string;
}) {
  const totals = sumSalesContractMoneyColumns(rows);
  const exportRows = rows.map((r) => [
    r.projectName,
    r.projectNo,
    r.city,
    r.woValue,
    r.totalInvoiceNet,
    r.leftoverBilling,
    r.totalPaid,
    r.totalOutstanding,
  ]);
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[16%]" />
            <col className="w-[8%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={cn(reportTh, "text-right")}>WO value</th>
              <th className={cn(reportTh, "text-right")}>Total invoice</th>
              <th className={cn(reportTh, "text-right")}>Leftover billing</th>
              <th className={cn(reportTh, "text-right")}>Total paid</th>
              <th className={cn(reportTh, "text-right")}>Total outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-[var(--fh-muted)]"
                >
                  No matching contracts.
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
                  <td className={cn(reportTd, "break-words")}>{r.city}</td>
                  <td className={reportMoney}>{formatMoney(r.woValue)}</td>
                  <td className={reportMoney}>
                    {formatMoney(r.totalInvoiceNet)}
                  </td>
                  <td className={reportMoney}>
                    {formatMoney(r.leftoverBilling)}
                  </td>
                  <td className={reportMoney}>{formatMoney(r.totalPaid)}</td>
                  <td className={cn(reportMoney, "font-medium")}>
                    {formatMoney(r.totalOutstanding)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="border-t border-[var(--fh-line)] bg-[var(--fh-bg)] font-medium">
              <tr>
                <td className={reportTd} colSpan={2}>
                  Total
                </td>
                <td className={reportMoney}>{formatMoney(totals.woValue)}</td>
                <td className={reportMoney}>
                  {formatMoney(totals.totalInvoice)}
                </td>
                <td className={reportMoney}>
                  {formatMoney(totals.leftoverBilling)}
                </td>
                <td className={reportMoney}>{formatMoney(totals.totalPaid)}</td>
                <td className={reportMoney}>
                  {formatMoney(totals.totalOutstanding)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="sales-contracts"
        title="Sales Report — Contracts"
        filters={filters}
        headers={[...SALES_CONTRACT_EXPORT_HEADERS]}
        rows={
          rows.length > 0
            ? [...exportRows, salesContractTotalExportRow(totals)]
            : exportRows
        }
      />
    </>
  );
}
