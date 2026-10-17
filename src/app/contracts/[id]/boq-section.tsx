"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  amendContractBoq,
  boqAmendmentIssues,
  boqPlainEditIssues,
  computeBoqLineDiffs,
  describeBoqLineUse,
  editContractBoq,
  nextAmendmentSeq,
  useFlowhubData,
} from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  boqTotal,
  defaultAmendmentNumber,
  type BoqAmendmentLineDiff,
  type BoqItem,
  type Contract,
} from "@/lib/types";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/format-money";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type DraftRow = {
  id: string;
  catalogKey: string;
  name: string;
  unit: string;
  rate: string;
  qty: string;
  isNew: boolean;
  removed: boolean;
};

function todayIsoLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function rowsFromBoq(boq: BoqItem[]): DraftRow[] {
  return boq.map((l) => ({
    id: l.id,
    catalogKey: l.catalogKey,
    name: l.name,
    unit: l.unit,
    rate: String(l.rate),
    qty: String(l.quantity),
    isNew: false,
    removed: false,
  }));
}

function rowsToBoq(rows: DraftRow[]): BoqItem[] {
  return rows
    .filter((r) => !r.removed)
    .map((r) => ({
      id: r.id,
      catalogKey: r.catalogKey || r.name.trim().toLowerCase(),
      name: r.name.trim(),
      unit: r.unit.trim() || "Nos",
      rate: Number(r.rate) || 0,
      quantity: Number(r.qty) || 0,
    }));
}

function diffLabel(d: BoqAmendmentLineDiff): string {
  if (d.kind === "added") return `Added · ${d.newQty} ${d.unit}`;
  if (d.kind === "removed") return `Removed · was ${d.previousQty} ${d.unit}`;
  return `Qty ${d.previousQty} → ${d.newQty} ${d.unit}`;
}

function diffAmount(d: BoqAmendmentLineDiff): number {
  return d.rate * ((d.newQty ?? 0) - (d.previousQty ?? 0));
}

export function BoqSection({
  contract,
  canEdit,
  canAmend,
  actorName,
}: {
  contract: Contract;
  canEdit: boolean;
  canAmend: boolean;
  actorName: string;
  onMessage: (msg: string) => void;
}) {
  const data = useFlowhubData();
  const c = contract;
  const total = boqTotal(c.boq);
  const amendments = c.amendments ?? [];

  const [step, setStep] = useState<"closed" | "plain" | "edit" | "confirm">(
    "closed"
  );
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [newName, setNewName] = useState("");
  const [newUnit, setNewUnit] = useState("Nos");
  const [newRate, setNewRate] = useState("");
  const [newQty, setNewQty] = useState("");
  const [amdNumber, setAmdNumber] = useState("");
  const [amdDate, setAmdDate] = useState("");
  const [amdNote, setAmdNote] = useState("");
  const [confirmedValue, setConfirmedValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const proposed = useMemo(() => rowsToBoq(rows), [rows]);
  const diffs = useMemo(
    () => computeBoqLineDiffs(c.boq, proposed),
    [c.boq, proposed]
  );
  const issues = useMemo(
    () =>
      step === "edit" || step === "confirm"
        ? boqAmendmentIssues(c.id, proposed, data)
        : [],
    [step, c.id, proposed, data]
  );
  const plainIssues = useMemo(
    () => (step === "plain" ? boqPlainEditIssues(c.id, proposed, data) : []),
    [step, c.id, proposed, data]
  );
  const lineUse = useMemo(() => {
    const map = new Map<string, string>();
    if (step !== "plain") return map;
    for (const line of c.boq) {
      const phrase = describeBoqLineUse(c.id, line.id, data);
      if (phrase) map.set(line.id, phrase);
    }
    return map;
  }, [step, c.boq, c.id, data]);
  const proposedTotal = boqTotal(proposed);
  const seq = nextAmendmentSeq(c);
  const valueGap = c.orderValue - total;

  function openPlainEditor() {
    setRows(rowsFromBoq(c.boq));
    setNewName("");
    setNewUnit("Nos");
    setNewRate("");
    setNewQty("");
    setError(null);
    setStep("plain");
  }

  function openEditor() {
    setRows(rowsFromBoq(c.boq));
    setNewName("");
    setNewUnit("Nos");
    setNewRate("");
    setNewQty("");
    setAmdNumber(defaultAmendmentNumber(seq));
    setAmdDate(todayIsoLocal());
    setAmdNote("");
    setError(null);
    setStep("edit");
  }

  function cancel() {
    setStep("closed");
    setError(null);
  }

  function patchRow(id: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function onNewNameChange(v: string) {
    setNewName(v);
    const hit = data.itemCatalog.find(
      (x) => x.name.toLowerCase() === v.trim().toLowerCase()
    );
    if (hit) {
      setNewUnit(hit.unit);
      setNewRate(String(hit.lastRate));
    }
  }

  function addPlainRow() {
    setError(null);
    const name = newName.trim();
    if (!name) {
      setError("New line needs an item name.");
      return;
    }
    if (newRate.trim() === "" || newQty.trim() === "") {
      setError("New line needs a rate and a qty.");
      return;
    }
    const rate = Number(newRate);
    const qty = Number(newQty);
    if (!Number.isFinite(rate) || rate < 0 || !Number.isFinite(qty) || qty < 0) {
      setError("New line needs a rate and qty of 0 or more.");
      return;
    }
    if (
      rows.some((r) => !r.removed && r.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      setError(`${name} is already on the BOQ.`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogKey: name.toLowerCase(),
        name,
        unit: newUnit.trim() || "Nos",
        rate: newRate,
        qty: newQty,
        isNew: true,
        removed: false,
      },
    ]);
    setNewName("");
    setNewUnit("Nos");
    setNewRate("");
    setNewQty("");
  }

  function addRow() {
    setError(null);
    const name = newName.trim();
    if (!name || !(Number(newRate) > 0) || !(Number(newQty) > 0)) {
      setError("New line needs item name, rate > 0, and qty > 0.");
      return;
    }
    if (
      rows.some((r) => !r.removed && r.name.trim().toLowerCase() === name.toLowerCase())
    ) {
      setError(`${name} is already on the BOQ — change its qty instead.`);
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        catalogKey: name.toLowerCase(),
        name,
        unit: newUnit.trim() || "Nos",
        rate: newRate,
        qty: newQty,
        isNew: true,
        removed: false,
      },
    ]);
    setNewName("");
    setNewUnit("Nos");
    setNewRate("");
    setNewQty("");
  }

  function goConfirm() {
    setError(null);
    if (issues.length) {
      setError(issues[0]);
      return;
    }
    if (!diffs.length) {
      setError("No BOQ changes yet — change a qty, add, or remove a line.");
      return;
    }
    setConfirmedValue(String(Math.round(proposedTotal * 100) / 100));
    setStep("confirm");
  }

  async function savePlain() {
    setError(null);
    if (plainIssues.length) {
      setError(plainIssues[0]);
      return;
    }
    setSaving(true);
    const res = editContractBoq({
      contractId: c.id,
      boq: proposed,
    });
    if (!res.ok) {
      setSaving(false);
      setError(res.error);
      return;
    }
    const saved = await confirmWorkspaceSave();
    setSaving(false);
    if (!saved) return;
    setStep("closed");
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = amendContractBoq({
      contractId: c.id,
      boq: proposed,
      newOrderValue: Number(confirmedValue),
      number: amdNumber,
      date: amdDate,
      note: amdNote,
      by: actorName,
    });
    if (!res.ok) {
      setSaving(false);
      setError(res.error);
      return;
    }
    const saved = await confirmWorkspaceSave();
    setSaving(false);
    if (!saved) return;
    setStep("closed");
  }

  return (
    <section
      id="boq"
      className="scroll-mt-20 rounded-xl border border-[var(--fh-line)] bg-white p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          BOQ
          {amendments.length > 0 && (
            <span className="ml-2 align-middle text-xs font-normal text-[var(--fh-muted)]">
              as amended by {amendments[amendments.length - 1].number}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums">{formatMoney(total)}</span>
          {canEdit && step === "closed" && (
            <Button type="button" size="sm" variant="outline" onClick={openPlainEditor}>
              Edit BOQ
            </Button>
          )}
          {canAmend && step === "closed" && (
            <Button
              type="button"
              size="sm"
              className="bg-[var(--fh-steel)]"
              onClick={openEditor}
            >
              Add amendment
            </Button>
          )}
        </div>
      </div>

      {step === "closed" && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--fh-line)]">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium text-right">Rate</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--fh-line)]">
              {c.boq.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2 font-medium">{l.name}</td>
                  <td className="px-3 py-2">{l.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(l.rate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatMoney(l.rate * l.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === "plain" && (
        <div
          className="mt-4 space-y-4 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-4"
          {...entryRootProps}
        >
          <div>
            <p className="text-sm font-medium text-[var(--fh-steel)]">Edit BOQ</p>
            <p className="text-xs text-[var(--fh-muted)]">
              Add lines, or change a line that is not used yet. A line already
              on an invoice, a schedule, or a delivery challan cannot be
              deleted, and its name and unit stay locked. Its quantity and rate
              can still change, including a quantity below what is already
              billed, scheduled, or delivered. Saving sets the contract value
              to this total. It does not create an amendment, and bank
              guarantee amounts stay as saved.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--fh-line)] bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {rows.map((r) => {
                  const locked = !r.isNew && lineUse.has(r.id);
                  const useText = lineUse.get(r.id);
                  const qty = Number(r.qty) || 0;
                  const rate = Number(r.rate) || 0;
                  return (
                    <tr key={r.id}>
                      <td className="px-3 py-1.5">
                        {locked ? (
                          <div>
                            <span className="font-medium">{r.name}</span>
                            {useText && (
                              <span className="mt-0.5 block text-xs font-normal text-[var(--fh-muted)]">
                                On {useText} — name and unit locked
                              </span>
                            )}
                          </div>
                        ) : (
                          <Input
                            value={r.name}
                            onChange={(e) => patchRow(r.id, { name: e.target.value })}
                            aria-label={`Item name for ${r.name || "new line"}`}
                            className="h-8"
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {locked ? (
                          r.unit
                        ) : (
                          <Input
                            value={r.unit}
                            onChange={(e) => patchRow(r.id, { unit: e.target.value })}
                            aria-label={`Unit for ${r.name || "new line"}`}
                            className="h-8 w-24"
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={r.rate}
                          onChange={(e) => patchRow(r.id, { rate: e.target.value })}
                          className="ml-auto h-8 w-28 text-right"
                          aria-label={`Rate for ${r.name || "new line"}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={r.qty}
                          onChange={(e) => patchRow(r.id, { qty: e.target.value })}
                          className="ml-auto h-8 w-24 text-right"
                          aria-label={`Qty for ${r.name || "new line"}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatMoney(rate * qty)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {locked ? null : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setRows((prev) => prev.filter((x) => x.id !== r.id))
                            }
                          >
                            Delete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-[var(--fh-line)] bg-white p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
              Add BOQ line
            </p>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Item name</Label>
                <Input
                  list="plain-boq-item-catalog"
                  value={newName}
                  onChange={(e) => onNewNameChange(e.target.value)}
                  placeholder="Type to match previous items"
                />
                <datalist id="plain-boq-item-catalog">
                  {data.itemCatalog.map((x) => (
                    <option key={x.key} value={x.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={addPlainRow}>
                + Add line
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="tabular-nums">
              Contract value {formatMoney(c.orderValue)} →{" "}
              <strong>{formatMoney(proposedTotal)}</strong>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button
                type="button"
                {...entrySaveProps}
                className="bg-[var(--fh-steel)]"
                onClick={savePlain}
                disabled={saving || plainIssues.length > 0}
              >
                {saving ? "Saving…" : "Save BOQ"}
              </Button>
            </div>
          </div>
          {plainIssues.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {plainIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === "edit" && (
        <div
          className="mt-4 space-y-4 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-4"
          {...entryRootProps}
        >
          <div>
            <p className="text-sm font-medium text-[var(--fh-steel)]">
              Amendment editor · {defaultAmendmentNumber(seq)}
            </p>
            <p className="text-xs text-[var(--fh-muted)]">
              Change quantities, add lines, or remove lines. Rates on existing
              lines stay as contracted. Nothing is saved until you confirm.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[var(--fh-line)] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Current qty</th>
                  <th className="px-3 py-2 font-medium text-right">New qty</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {rows.map((r) => {
                  const original = c.boq.find((b) => b.id === r.id);
                  const qty = Number(r.qty) || 0;
                  const changed =
                    r.isNew || r.removed || (original && original.quantity !== qty);
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        r.removed && "bg-red-50/60 text-[var(--fh-muted)]",
                        !r.removed && changed && "bg-amber-50/60"
                      )}
                    >
                      <td className="px-3 py-2 font-medium">
                        <span className={cn(r.removed && "line-through")}>
                          {r.name}
                        </span>
                        {r.isNew && (
                          <span className="ml-1 text-xs font-normal text-emerald-700">
                            new
                          </span>
                        )}
                        {r.removed && (
                          <span className="ml-1 text-xs font-normal text-red-700">
                            removed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">{r.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(Number(r.rate) || 0)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {original ? original.quantity : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Input
                          type="number"
                          step="any"
                          min={0}
                          value={r.qty}
                          disabled={r.removed}
                          onChange={(e) => patchRow(r.id, { qty: e.target.value })}
                          className="ml-auto h-8 w-24 text-right"
                          aria-label={`New qty for ${r.name}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {r.removed ? "—" : formatMoney((Number(r.rate) || 0) * qty)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.isNew ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setRows((prev) => prev.filter((x) => x.id !== r.id))
                            }
                          >
                            Remove
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => patchRow(r.id, { removed: !r.removed })}
                          >
                            {r.removed ? "Restore" : "Remove"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-lg border border-dashed border-[var(--fh-line)] bg-white p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
              Add BOQ line
            </p>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label className="text-xs">Item name</Label>
                <Input
                  list="amendment-item-catalog"
                  value={newName}
                  onChange={(e) => onNewNameChange(e.target.value)}
                  placeholder="Type to match previous items"
                />
                <datalist id="amendment-item-catalog">
                  {data.itemCatalog.map((x) => (
                    <option key={x.key} value={x.name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={addRow}>
                + Add line
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="tabular-nums">
              BOQ {formatMoney(total)} →{" "}
              <strong>{formatMoney(proposedTotal)}</strong>
              <span className="ml-2 text-[var(--fh-muted)]">
                ({diffs.length} line change{diffs.length === 1 ? "" : "s"})
              </span>
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button
                type="button"
                {...entrySaveProps}
                className="bg-[var(--fh-steel)]"
                onClick={goConfirm}
                disabled={!diffs.length || issues.length > 0}
              >
                Review &amp; confirm value
              </Button>
            </div>
          </div>
          {issues.length > 0 && (
            <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step === "confirm" && (
        <form
          onSubmit={confirm}
          {...entryRootProps}
          className="mt-4 space-y-4 rounded-lg border border-[var(--fh-line)] bg-[var(--fh-bg)] p-4"
        >
          <p className="text-sm font-medium text-[var(--fh-steel)]">
            Confirm amendment
          </p>
          <ul className="space-y-1 rounded-md border border-[var(--fh-line)] bg-white p-3 text-sm">
            {diffs.map((d) => {
              const amt = diffAmount(d);
              return (
                <li
                  key={`${d.kind}-${d.boqItemId}`}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <span>
                    <strong>{d.name}</strong>{" "}
                    <span className="text-[var(--fh-muted)]">· {diffLabel(d)}</span>
                  </span>
                  <span
                    className={cn(
                      "tabular-nums",
                      amt < 0 ? "text-red-700" : "text-emerald-700"
                    )}
                  >
                    {amt >= 0 ? "+" : ""}
                    {formatMoney(amt)}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-[var(--fh-line)] bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                Current contract / WO value
              </p>
              <p className="mt-1 text-sm font-medium tabular-nums">
                {formatMoney(c.orderValue)}
              </p>
            </div>
            <div className="rounded-md border border-[var(--fh-line)] bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                Computed new value (amended BOQ)
              </p>
              <p className="mt-1 text-sm font-medium tabular-nums">
                {formatMoney(proposedTotal)}
              </p>
            </div>
            <div className="space-y-1 rounded-md border border-[var(--fh-steel)] bg-white p-3">
              <Label className="text-xs uppercase tracking-wide">
                Confirmed new contract / WO value
              </Label>
              <Input
                type="number"
                step="any"
                min={0}
                value={confirmedValue}
                onChange={(e) => setConfirmedValue(e.target.value)}
                required
              />
            </div>
          </div>
          {Math.abs(valueGap) > 0.005 && (
            <p className="text-xs text-[var(--fh-muted)]">
              Note: the current order value differs from the current BOQ total by{" "}
              {formatMoney(valueGap)}. Adjust the confirmed value if that gap
              should carry over.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Amendment no.</Label>
              <Input
                value={amdNumber}
                onChange={(e) => setAmdNumber(e.target.value)}
                placeholder={defaultAmendmentNumber(seq)}
              />
            </div>
            <div className="space-y-1">
              <Label>Amendment date</Label>
              <Input
                type="date"
                value={amdDate}
                onChange={(e) => setAmdDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input
                value={amdNote}
                onChange={(e) => setAmdNote(e.target.value)}
                placeholder="Client letter ref, reason…"
              />
            </div>
          </div>

          <p className="text-xs text-[var(--fh-muted)]">
            On confirm the BOQ is replaced with the amended lines and the
            contract / WO value becomes the confirmed value. Saved ABG and PBG
            amounts stay as they are.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("edit")}>
              Back to editor
            </Button>
            <Button type="button" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              {...entrySaveProps}
              className="bg-[var(--fh-steel)]"
              disabled={saving || !(Number(confirmedValue) > 0)}
            >
              {saving ? "Saving…" : "Confirm amendment"}
            </Button>
          </div>
        </form>
      )}

      {error && step !== "closed" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6 border-t border-[var(--fh-line)] pt-4">
        <h3 className="text-sm font-medium text-[var(--fh-steel)]">
          Amendment history
        </h3>
        {amendments.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--fh-muted)]">
            No amendments yet — BOQ and value are as originally contracted.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--fh-line)]">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-[var(--fh-line)] bg-[var(--fh-bg)] text-xs uppercase tracking-wide text-[var(--fh-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">No.</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium text-right">Old value</th>
                  <th className="px-3 py-2 font-medium text-right">New value</th>
                  <th className="px-3 py-2 font-medium">Changes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--fh-line)]">
                {[...amendments].reverse().map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="px-3 py-2 font-medium">{a.number}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatDisplayDate(a.date)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(a.previousOrderValue)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {formatMoney(a.newOrderValue)}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--fh-muted)]">
                      <ul className="space-y-0.5">
                        {a.lineDiffs.map((d) => (
                          <li key={`${d.kind}-${d.boqItemId}`}>
                            <span className="text-[var(--fh-ink)]">{d.name}</span> ·{" "}
                            {diffLabel(d)}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1">
                        {a.by ? `${a.by} · ` : ""}
                        {formatDisplayDateTime(a.at)}
                        {a.note ? ` · ${a.note}` : ""}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
