"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import type { FlowhubData, InstallationProgress } from "@/lib/types";
import {
  flushWorkspace,
  installationProgressFor,
  recordInstallationTotal,
  suppliedQty,
} from "@/lib/store";
import { formatDisplayDate } from "@/lib/dates";
import { formatQty } from "@/lib/execution-reports";
import { ContractTypeahead } from "@/components/contract-typeahead";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import {
  ReportExportIcons,
  reportFilterSummary,
} from "@/components/report-export-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ReportsEmpty,
  ReportsTableScroll,
  reportTd,
  reportTh,
} from "../reports-shell";
import { FormMessage, qtyCell, todayIsoLocal } from "./execution-ui";

type Msg = { kind: "ok" | "error"; text: string } | null;

const QTY_EPS = 1e-9;

function installationSavedText(name: string, progress: InstallationProgress): string {
  const last = progress.history[progress.history.length - 1];
  return `${name}: installed ${formatQty(progress.installedQty)} (${last.delta > 0 ? "+" : ""}${formatQty(last.delta)}) as of ${formatDisplayDate(last.at)}.`;
}

function flushErrorText(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Could not save.";
}

export function InstallationsTab({
  data,
  canEdit,
  actorName,
  contractId,
  onContractChange,
}: {
  data: FlowhubData;
  canEdit: boolean;
  actorName: string;
  contractId: string;
  onContractChange: (id: string) => void;
}) {
  const contract = data.contracts.find((c) => c.id === contractId) ?? null;
  const [msg, setMsg] = useState<Msg>(null);
  const [date, setDate] = useState(todayIsoLocal);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);

  const items = useMemo(() => {
    if (!contract) return [];
    return contract.boq.map((b) => {
      const progress = installationProgressFor(contract.id, b.id, data);
      return {
        item: b,
        supplied: suppliedQty(contract.id, b.id, data),
        installed: progress?.installedQty ?? 0,
        lastUpdatedAt: progress?.lastUpdatedAt ?? null,
      };
    });
  }, [contract, data]);

  const history = useMemo(() => {
    if (!contract) return [];
    const names = new Map(contract.boq.map((b) => [b.id, b.name]));
    return data.installationProgress
      .filter((p) => p.contractId === contract.id)
      .flatMap((p) =>
        p.history.map((h) => ({
          ...h,
          itemName: names.get(p.boqItemId) ?? "—",
        }))
      )
      .sort(
        (a, b) =>
          b.at.localeCompare(a.at) || b.recordedAt.localeCompare(a.recordedAt)
      );
  }, [contract, data.installationProgress]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!contract || savingLock.current) return;
    const pending = items.flatMap(({ item, supplied, installed }) => {
      const raw = (drafts[item.id] ?? "").trim();
      if (raw === "") return [];
      return [{ item, supplied, installed, total: Number(raw) }];
    });
    if (pending.length === 0) {
      setMsg({ kind: "error", text: "Enter the new cumulative installed total." });
      return;
    }
    const dateIso = date.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      setMsg({ kind: "error", text: "Update date is required." });
      return;
    }
    for (const row of pending) {
      if (!Number.isFinite(row.total) || row.total < 0) {
        setMsg({
          kind: "error",
          text: "Enter a cumulative installed qty of 0 or more.",
        });
        return;
      }
      if (row.total > row.supplied + QTY_EPS) {
        setMsg({
          kind: "error",
          text: `${row.item.name}: installed total ${row.total} exceeds supplied ${row.supplied}.`,
        });
        return;
      }
      if (Math.abs(row.total - row.installed) < QTY_EPS) {
        setMsg({
          kind: "error",
          text: `${row.item.name}: total is already ${row.installed}.`,
        });
        return;
      }
    }

    savingLock.current = true;
    setSaving(true);
    const saved: { id: string; name: string; progress: InstallationProgress }[] = [];
    const clearSaved = () => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of saved) delete next[row.id];
        return next;
      });
    };
    try {
      for (const row of pending) {
        const res = recordInstallationTotal(
          {
            contractId: contract.id,
            boqItemId: row.item.id,
            newTotal: row.total,
            date,
          },
          { by: actorName }
        );
        if (!res.ok) {
          if (saved.length > 0) {
            await flushWorkspace();
            clearSaved();
          }
          setMsg({ kind: "error", text: res.error });
          return;
        }
        saved.push({ id: row.item.id, name: row.item.name, progress: res.value });
      }
      await flushWorkspace();
      clearSaved();
      setMsg({
        kind: "ok",
        text: saved
          .map((row) => installationSavedText(row.name, row.progress))
          .join(" "),
      });
    } catch (err) {
      setMsg({ kind: "error", text: flushErrorText(err) });
    } finally {
      savingLock.current = false;
      setSaving(false);
    }
  }

  const wide = canEdit && contract != null;
  const editing = canEdit && contract != null && contract.boq.length > 0;
  const canSaveAny = items.some((row) => row.supplied > 0);
  const spanClass = editing ? "col-span-3" : wide ? "col-span-2" : "col-span-1";
  const frameClass = cn(
    "grid min-h-0 flex-1 justify-start gap-x-3 gap-y-4 overflow-hidden",
    editing
      ? "grid-cols-[minmax(0,36rem)_auto_auto]"
      : wide
        ? "grid-cols-[minmax(0,36rem)_auto]"
        : "grid-cols-1",
    msg ? "grid-rows-[auto_auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"
  );
  const listRow = msg ? "row-start-3" : "row-start-2";

  const frame = (
    <>
      <div
        className={cn(
          "col-start-1 row-start-1 min-w-0 self-end",
          !wide && "max-w-xl"
        )}
        data-entry-ignore=""
      >
        <ContractTypeahead
          contracts={data.contracts}
          value={contractId}
          onChange={(id) => {
            setMsg(null);
            setDrafts({});
            onContractChange(id);
          }}
        />
      </div>
      {wide && (
        <div className="col-start-2 row-start-1 space-y-1 self-end">
          <Label htmlFor="install-date">Update date</Label>
          <Input
            id="install-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-[10.5rem] bg-white"
          />
        </div>
      )}
      {editing && (
        <Button
          type="submit"
          {...entrySaveProps}
          disabled={saving || !canSaveAny}
          className="col-start-3 row-start-1 self-end bg-[var(--fh-accent)] text-[var(--fh-ink)] hover:bg-[#f0b01a]"
        >
          {saving ? "Saving…" : "Update"}
        </Button>
      )}

      {msg ? (
        <div className={cn(spanClass, "col-start-1 row-start-2")}>
          <FormMessage msg={msg} />
        </div>
      ) : null}

      <div
        className={cn(
          spanClass,
          "col-start-1 flex min-h-0 flex-col gap-4 self-stretch overflow-hidden",
          listRow
        )}
      >
      {!contract ? (
        <ReportsEmpty message="Select a contract to see and update installation progress." />
      ) : contract.boq.length === 0 ? (
        <ReportsEmpty message="This contract has no BOQ items." />
      ) : (
        <>
          {canEdit && (
            <p className="shrink-0 text-xs text-[var(--fh-muted)]">
              Enter the new cumulative installed total (not the increment). It
              cannot exceed supplied qty.
            </p>
          )}
          <ReportsTableScroll className="min-h-0">
            <table className="w-full table-fixed text-left text-sm">
              <colgroup>
                <col className={canEdit ? "w-[34%]" : "w-[40%]"} />
                <col className={canEdit ? "w-[12%]" : "w-[11%]"} />
                <col className={canEdit ? "w-[12%]" : "w-[11%]"} />
                <col className="w-[12%]" />
                <col className={canEdit ? "w-[15%]" : "w-[26%]"} />
                {canEdit && <col className="w-[15%]" />}
              </colgroup>
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className={reportTh}>Item</th>
                  <th className={cn(reportTh, "text-right")}>BOQ qty</th>
                  <th className={cn(reportTh, "text-right")}>Supplied</th>
                  <th className={cn(reportTh, "text-right")}>Installed</th>
                  <th className={reportTh}>Last update</th>
                  {canEdit && (
                    <th className={cn(reportTh, "text-right")}>New total</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {items.map(({ item, supplied, installed, lastUpdatedAt }) => {
                  const draft = drafts[item.id] ?? "";
                  const over = draft !== "" && Number(draft) > supplied + 1e-9;
                  return (
                    <tr key={item.id}>
                      <td className={reportTd}>
                        <span className="break-words">{item.name}</span>
                        {item.unit ? (
                          <span className="block text-xs text-[var(--fh-muted)]">
                            {item.unit}
                          </span>
                        ) : null}
                      </td>
                      <td className={qtyCell}>{formatQty(item.quantity)}</td>
                      <td className={qtyCell}>{formatQty(supplied)}</td>
                      <td className={cn(qtyCell, "font-medium")}>
                        {formatQty(installed)}
                      </td>
                      <td className={cn(reportTd, "tabular-nums")}>
                        {formatDisplayDate(lastUpdatedAt)}
                      </td>
                      {canEdit && (
                        <td className="px-1 py-1.5 sm:px-1.5">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={supplied}
                            step="any"
                            value={draft}
                            disabled={supplied <= 0}
                            placeholder={
                              supplied <= 0 ? "Not supplied" : formatQty(installed)
                            }
                            onChange={(e) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            aria-label={`New installed total for ${item.name}`}
                            aria-invalid={over || undefined}
                            className={cn(
                              "h-8 bg-white text-right tabular-nums",
                              over && "border-[var(--destructive)]"
                            )}
                          />
                          {over && (
                            <span className="mt-0.5 block text-right text-[10px] text-[var(--destructive)]">
                              Max {formatQty(supplied)}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ReportsTableScroll>
          <ReportExportIcons
            filename={`installations-${contract.projectNo}`}
            title="Operations — Installations"
            filters={reportFilterSummary({
              tab: "Installations",
              contract: `${contract.projectNo} · ${contract.projectName}`,
            })}
            headers={["Item", "Unit", "BOQ qty", "Supplied", "Installed", "Last update"]}
            rows={items.map(({ item, supplied, installed, lastUpdatedAt }) => [
              item.name,
              item.unit,
              item.quantity,
              supplied,
              installed,
              formatDisplayDate(lastUpdatedAt),
            ])}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <h3 className="shrink-0 font-[family-name:var(--font-display)] text-lg text-[var(--fh-steel)]">
              Installation history
            </h3>
            <ReportsTableScroll className="mt-2 min-h-0">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[38%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] uppercase tracking-wide text-[var(--fh-muted)]">
                  <tr>
                    <th className={reportTh}>Date</th>
                    <th className={reportTh}>Item</th>
                    <th className={cn(reportTh, "text-right")}>Change</th>
                    <th className={cn(reportTh, "text-right")}>Running total</th>
                    <th className={reportTh}>By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--fh-line)]">
                  {history.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-[var(--fh-muted)]"
                      >
                        No installation updates yet.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id}>
                        <td className={cn(reportTd, "tabular-nums")}>
                          {formatDisplayDate(h.at)}
                        </td>
                        <td className={reportTd}>{h.itemName}</td>
                        <td
                          className={cn(
                            qtyCell,
                            h.delta < 0 && "text-[var(--destructive)]"
                          )}
                        >
                          {h.delta > 0 ? "+" : ""}
                          {formatQty(h.delta)}
                        </td>
                        <td className={cn(qtyCell, "font-medium")}>
                          {formatQty(h.totalAfter)}
                        </td>
                        <td
                          className={cn(reportTd, "text-xs text-[var(--fh-muted)]")}
                        >
                          {h.by || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ReportsTableScroll>
            <ReportExportIcons
              filename={`installation-history-${contract.projectNo}`}
              title="Operations — Installation history"
              filters={reportFilterSummary({
                tab: "Installations · History",
                contract: `${contract.projectNo} · ${contract.projectName}`,
              })}
              headers={["Date", "Item", "Change", "Running total", "By"]}
              rows={history.map((h) => [
                formatDisplayDate(h.at),
                h.itemName,
                h.delta,
                h.totalAfter,
                h.by,
              ])}
            />
          </div>
        </>
      )}
      </div>
    </>
  );

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {editing ? (
        <form
          onSubmit={onSubmit}
          noValidate
          {...entryRootProps}
          className={frameClass}
        >
          {frame}
        </form>
      ) : (
        <div className={frameClass}>{frame}</div>
      )}
    </div>
  );
}
