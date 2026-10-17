"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  closureDateNeedsAttention,
  taskIsOpen,
  useFlowhubData,
} from "@/lib/store";
import { workspaceIndex } from "@/lib/workspace-index";
import {
  RowWindowFooter,
  rowWindowKey,
  useRowWindow,
} from "@/components/list-window";
import { contractDisplayStatus, todayIso } from "@/lib/nexus-core";
import { GST_RATE } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListSearchBar } from "@/components/list-search";
import { contractMatchesQuery } from "@/lib/list-search";
import { formatDisplayDate } from "@/lib/dates";
import { HubDataScroll, HubPage } from "@/components/hub-scroll";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ContractsPage() {
  const data = useFlowhubData();
  const [q, setQ] = useState("");
  const today = todayIso();

  const index = useMemo(() => workspaceIndex(data), [data]);
  const rows = useMemo(() => {
    return data.contracts
      .filter((c) => contractMatchesQuery(c, q))
      .slice()
      .sort((a, b) => {
        const da = a.closureDate || "9999-12-31";
        const db = b.closureDate || "9999-12-31";
        return da.localeCompare(db);
      });
  }, [data.contracts, q]);
  const rowWindow = useRowWindow(
    rows.length,
    rowWindowKey(rows.length, rows[0]?.id, rows.at(-1)?.id)
  );
  const visibleRows = rows.slice(0, rowWindow.visibleCount);

  return (
    <HubPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Contracts
          </h1>
        </div>
        <Link
          href="/contracts/new"
          className={cn(
            buttonVariants(),
            "bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
          )}
        >
          New contract
        </Link>
      </div>

      <ListSearchBar
        value={q}
        onChange={setQ}
        placeholder="Search project, city, order, date, status…"
      />

      <HubDataScroll className="overflow-x-auto rounded-xl border border-[var(--fh-line)] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Closure date</TableHead>
              <TableHead className="text-right">Yet to bill</TableHead>
              <TableHead>Pending tasks</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-[var(--fh-muted)]">
                  {data.contracts.length === 0
                    ? "No contracts yet."
                    : "No contracts match your search."}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((c) => {
                const withGst = c.gstApplicable
                  ? c.orderValue * (1 + GST_RATE)
                  : c.orderValue;
                let billedNet = 0;
                for (const invoice of index.tisByContract.get(c.id) ?? []) {
                  billedNet += Number(invoice.netAmount) || 0;
                }
                const yetToBill = c.orderValue - billedNet;
                const pending = (index.tasksByContract.get(c.id) ?? []).filter(
                  (t) => !t.parentId && taskIsOpen(t)
                ).length;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/contracts/${c.id}`}
                        className="font-medium text-[var(--fh-steel)] hover:underline"
                      >
                        {c.projectName}
                      </Link>
                      <p className="text-xs text-[var(--fh-muted)]">{c.projectNo}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.orderNos}
                      <p className="text-xs text-[var(--fh-muted)]">
                        {formatDisplayDate(c.orderDate)}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.city}, {c.state}
                      <p className="text-xs text-[var(--fh-muted)]">{c.country}</p>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatMoney(c.orderValue)}
                      {c.gstApplicable && (
                        <p className="text-xs text-[var(--fh-muted)]">
                          w/ GST {formatMoney(withGst)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm tabular-nums",
                        closureDateNeedsAttention(c.id, data) &&
                          "font-semibold text-red-600"
                      )}
                    >
                      {formatDisplayDate(c.closureDate)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatMoney(yetToBill)}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/tasks?contractId=${c.id}&filter=pending`}
                        className="text-sm font-medium text-[var(--fh-steel)] hover:underline"
                      >
                        {pending} pending
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge>{contractDisplayStatus(data, c, today)}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <RowWindowFooter
          shown={rowWindow.visibleCount}
          total={rows.length}
          onShowMore={rowWindow.showMore}
        />
      </HubDataScroll>
    </HubPage>
  );
}
