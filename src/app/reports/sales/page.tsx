"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFlowhubData, useWorkspaceReady } from "@/lib/store";
import { formatMoney } from "@/lib/format-money";
import { formatDisplayDate } from "@/lib/dates";
import {
  SALES_INVOICE_EXPORT_HEADERS,
  buildSalesContractRows,
  buildSalesInvoiceRows,
  filterSalesInvoiceRows,
  salesInvoiceExportRow,
  sumSalesInvoiceNet,
} from "@/lib/reports";
import { matchesAny } from "@/lib/list-search";
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

function parseTab(raw: string | null): Tab {
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get("tab")));
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setTab(parseTab(searchParams.get("tab")));
  }, [searchParams]);

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "invoices") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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

  const contractRows = useMemo(() => {
    const needle = q.trim();
    if (!needle) return allContractRows;
    return allContractRows.filter((r) =>
      matchesAny(needle, [
        r.projectNo,
        r.projectName,
        r.city,
        r.woValue,
        r.totalInvoiceNet,
        r.leftoverBilling,
        r.totalPaid,
        r.totalOutstandingNet,
        r.totalOutstanding,
      ])
    );
  }, [allContractRows, q]);

  const netTotal = wholeUntilFiltered(
    sumSalesInvoiceNet(allInvoiceRows),
    sumSalesInvoiceNet(invoiceRows),
    invoiceFiltered
  );

  const contractOutstandingNetTotal = useMemo(
    () => contractRows.reduce((s, r) => s + r.totalOutstandingNet, 0),
    [contractRows]
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
                    Total outstanding net
                  </p>
                  <p className="mt-0.5 font-[family-name:var(--font-display)] text-xl tabular-nums text-[var(--fh-steel)]">
                    {formatMoney(contractOutstandingNetTotal)}
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
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="sales-invoices"
        title="Sales Report — Invoices"
        filters={filters}
        headers={[...SALES_INVOICE_EXPORT_HEADERS]}
        rows={rows.map(salesInvoiceExportRow)}
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
  return (
    <>
      <ReportsTableScroll className="mt-4">
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[6%]" />
            <col className="w-[13%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
          </colgroup>
          <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
            <tr>
              <th className={reportTh}>Project</th>
              <th className={reportTh}>City</th>
              <th className={cn(reportTh, "text-right")}>WO value</th>
              <th className={cn(reportTh, "text-right")}>Total invoice</th>
              <th className={cn(reportTh, "text-right")}>Leftover billing</th>
              <th className={cn(reportTh, "text-right")}>Total paid</th>
              <th className={cn(reportTh, "text-right")}>
                Total outstanding net
              </th>
              <th className={cn(reportTh, "text-right")}>Total outstanding</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--fh-line)]">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
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
                    {formatMoney(r.totalOutstandingNet)}
                  </td>
                  <td className={cn(reportMoney, "font-medium")}>
                    {formatMoney(r.totalOutstanding)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ReportsTableScroll>
      <ReportExportIcons
        filename="sales-contracts"
        title="Sales Report — Contracts"
        filters={filters}
        headers={[
          "Project",
          "Project no.",
          "City",
          "WO value",
          "Total invoice",
          "Leftover billing",
          "Total paid",
          "Total outstanding net",
          "Total outstanding",
        ]}
        rows={rows.map((r) => [
          r.projectName,
          r.projectNo,
          r.city,
          r.woValue,
          r.totalInvoiceNet,
          r.leftoverBilling,
          r.totalPaid,
          r.totalOutstandingNet,
          r.totalOutstanding,
        ])}
      />
    </>
  );
}
