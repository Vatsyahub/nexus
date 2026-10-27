"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HubReturnLink } from "@/components/hub-return-link";
import { useRouter } from "next/navigation";
import {
  contractScheduleCoverage,
  flushWorkspace,
  isContractScheduleComplete,
  saveContractSchedulePlan,
  deleteContractSchedule,
  useFlowhubData,
  type ScheduleItemInput,
  type ScheduleWindowInput,
} from "@/lib/store";
import { confirmAction } from "@/components/confirm-panel";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import type { Contract } from "@/lib/types";
import { SCHEDULE_DATE_NA, isScheduleDateNa } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import {
  DeleteIconButton,
  EditIconLink,
} from "@/components/icon-actions";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { ScheduleDateField } from "@/components/schedule-date-field";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

type WindowDraft = {
  startDate: string;
  endDate: string;
  quantity: string;
  edited?: boolean;
};

type ItemDraft = {
  boqItemId: string;
  name: string;
  rate: number;
  unit: string;
  boqQty: number;
  supplies: WindowDraft[];
  installations: WindowDraft[];
};

function emptyWindow(): WindowDraft {
  return { startDate: "", endDate: "", quantity: "", edited: false };
}

function windowsFromLines(
  lines: { startDate: string; endDate: string; quantity: number | null }[]
): WindowDraft[] {
  if (!lines.length) return [emptyWindow()];
  return lines.map((l) => ({
    startDate: l.startDate,
    endDate: l.endDate,
    quantity: l.quantity != null ? String(l.quantity) : "",
    edited: false,
  }));
}

function sumQty(windows: WindowDraft[]): number {
  return windows.reduce((s, w) => s + (Number(w.quantity) || 0), 0);
}

/** True when every supply window uses the date field's NA control. */
function supplyMarkedNa(windows: WindowDraft[]): boolean {
  const meaningful = windows.filter(
    (w) =>
      w.edited ||
      String(w.startDate || "").trim() ||
      String(w.endDate || "").trim() ||
      Number(w.quantity) > 0
  );
  return (
    meaningful.length > 0 &&
    meaningful.every(
      (w) =>
        isScheduleDateNa(w.startDate) &&
        (!String(w.endDate || "").trim() || isScheduleDateNa(w.endDate))
    )
  );
}

function toInputs(windows: WindowDraft[]): ScheduleWindowInput[] {
  return windows
    .filter(
      (w) =>
        w.startDate ||
        w.endDate ||
        Number(w.quantity) > 0 ||
        isScheduleDateNa(w.startDate)
    )
    .map((w) => ({
      startDate: w.startDate,
      endDate: w.endDate || w.startDate,
      quantity: Number(w.quantity) || 0,
      edited: w.edited === true,
    }));
}

function buildDrafts(
  contract: Contract,
  data: ReturnType<typeof useFlowhubData>
): ItemDraft[] {
  return contract.boq.map((b) => {
    const supplies = data.schedules.filter(
      (s) =>
        s.contractId === contract.id &&
        s.kind === "supply" &&
        s.boqItemId === b.id
    );
    const installations = data.schedules.filter(
      (s) =>
        s.contractId === contract.id &&
        s.kind === "installation" &&
        s.boqItemId === b.id
    );
    return {
      boqItemId: b.id,
      name: b.name,
      rate: b.rate,
      unit: b.unit,
      boqQty: b.quantity,
      supplies: windowsFromLines(supplies),
      installations: windowsFromLines(installations),
    };
  });
}

export function SchedulePlanner({
  contractId,
  mode,
  canEdit,
  actorName,
}: {
  contractId: string;
  mode: "plan" | "edit";
  canEdit: boolean;
  actorName: string;
}) {
  const router = useRouter();
  const data = useFlowhubData();
  const contract = data.contracts.find((c) => c.id === contractId) ?? null;
  const complete = contract
    ? isContractScheduleComplete(contract.id, data)
    : false;
  const coverage = contract
    ? contractScheduleCoverage(contract.id, data)
    : null;

  const testingLine = data.schedules.find(
    (s) => s.contractId === contractId && s.kind === "testing"
  );
  const handoverLine = data.schedules.find(
    (s) => s.contractId === contractId && s.kind === "handover"
  );
  const committedDefault = data.schedules.some(
    (s) => s.contractId === contractId && s.committed
  );

  const [items, setItems] = useState<ItemDraft[]>(() =>
    contract ? buildDrafts(contract, data) : []
  );
  const [testingDate, setTestingDate] = useState(testingLine?.startDate ?? "");
  const [handoverDate, setHandoverDate] = useState(
    handoverLine?.startDate ?? ""
  );
  const [committed, setCommitted] = useState(committedDefault);
  const [testingEdited, setTestingEdited] = useState(false);
  const [handoverEdited, setHandoverEdited] = useState(false);
  const [committedEdited, setCommittedEdited] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const scheduleStamp = data.schedules
    .filter((s) => s.contractId === contractId)
    .map((s) =>
      [
        s.id,
        s.updatedAt,
        s.kind,
        s.boqItemId,
        s.startDate,
        s.endDate,
        s.quantity,
        s.committed,
        s.done,
        s.doneAt,
      ].join(":")
    )
    .join("|");
  const [formStamp, setFormStamp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (contract && !formDirty && formStamp !== scheduleStamp) {
    setFormStamp(scheduleStamp);
    setItems(buildDrafts(contract, data));
    setTestingDate(testingLine?.startDate ?? "");
    setHandoverDate(handoverLine?.startDate ?? "");
    setCommitted(committedDefault);
    setTestingEdited(false);
    setHandoverEdited(false);
    setCommittedEdited(false);
  }

  const allItemsReady = useMemo(() => {
    return items.every((it) => {
      const s = sumQty(it.supplies);
      const i = sumQty(it.installations);
      return s === it.boqQty && i === it.boqQty;
    });
  }, [items]);

  const formComplete =
    allItemsReady && !!testingDate && !!handoverDate;

  function updateWindow(
    itemIdx: number,
    kind: "supplies" | "installations",
    winIdx: number,
    patch: Partial<WindowDraft>
  ) {
    setFormDirty(true);
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const list = it[kind].map((w, j) =>
          j === winIdx ? { ...w, ...patch, edited: true } : w
        );
        return { ...it, [kind]: list };
      })
    );
  }

  function ensureExtraWindow(
    itemIdx: number,
    kind: "supplies" | "installations"
  ) {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== itemIdx) return it;
        const sum = sumQty(it[kind]);
        if (sum >= it.boqQty) return it;
        const last = it[kind][it[kind].length - 1];
        if (
          last &&
          !last.quantity &&
          !last.startDate &&
          !isScheduleDateNa(last.startDate)
        )
          return it;
        if (sum < it.boqQty) {
          return { ...it, [kind]: [...it[kind], emptyWindow()] };
        }
        return it;
      })
    );
  }

  function onQtyBlur(
    itemIdx: number,
    kind: "supplies" | "installations"
  ) {
    const it = items[itemIdx];
    if (!it) return;
    const sum = sumQty(it[kind]);
    if (sum > it.boqQty) {
      setErr(
        `${kind === "supplies" ? "Supply" : "Installation"} qty for ${it.name} at ${formatMoney(it.rate)} exceeds BOQ (${sum} > ${it.boqQty}).`
      );
      return;
    }
    setErr(null);
    if (sum < it.boqQty && sum > 0) {
      ensureExtraWindow(itemIdx, kind);
    }
  }

  async function onSave() {
    if (!contract || !canEdit) return;
    setErr(null);
    for (const it of items) {
      if (supplyMarkedNa(it.supplies)) continue;
      const hasSupply = it.supplies.some(
        (w) => w.startDate && !isScheduleDateNa(w.startDate)
      );
      const hasInstall = it.installations.some(
        (w) =>
          (w.startDate && String(w.startDate).trim() !== "") ||
          Number(w.quantity) > 0
      );
      if (hasInstall && !hasSupply) {
        setErr(
          `Set a supply date for ${it.name} before adding installation.`
        );
        return;
      }
    }
    if (
      handoverDate &&
      !isScheduleDateNa(handoverDate) &&
      contract.closureDate &&
      handoverDate > contract.closureDate
    ) {
      const ok = await confirmAction({
        message: `Handover date is after the contract closure date (${contract.closureDate}). Save this schedule date anyway?`,
        action: "Save anyway",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const payload: ScheduleItemInput[] = items.map((it) => ({
        boqItemId: it.boqItemId,
        supplies: toInputs(it.supplies),
        installations: toInputs(it.installations),
      }));
      for (const it of items) {
        if (supplyMarkedNa(it.supplies)) continue;
        const s = sumQty(it.supplies);
        const i = sumQty(it.installations);
        if (s > it.boqQty || i > it.boqQty) {
          setErr(`Qty exceeds BOQ for ${it.name} at ${formatMoney(it.rate)}.`);
          return;
        }
      }
      const result = saveContractSchedulePlan(
        {
          contractId: contract.id,
          committed,
          testingDate,
          testingEdited,
          handoverDate,
          handoverEdited,
          committedEdited,
          items: payload,
        },
        { by: actorName }
      );
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      const saved = await confirmWorkspaceSave();
      if (!saved) return;
      router.push("/schedules");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!contract || !canEdit) return;
    if (
      !(await confirmAction({
        message: `Delete the full schedule for ${contract.projectNo}? This removes all supply, installation, testing, and handover lines for this contract.`,
        action: "Delete",
      }))
    ) {
      return;
    }
    const result = deleteContractSchedule(contract.id, { by: actorName });
    if (!result.ok) {
      setErr(result.error);
      return;
    }
    await flushWorkspace();
    router.push("/schedules");
  }

  if (!contract) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Contract not found.</p>
        <HubReturnLink href="/schedules" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to schedules
        </HubReturnLink>
      </div>
    );
  }

  if (mode === "plan" && complete) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/schedules/new"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back
        </Link>
        <div className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-6">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
            Schedule already exists
          </h1>
          <p className="text-sm text-[var(--fh-muted)]">
            <strong className="text-[var(--fh-ink)]">{contract.projectNo}</strong>{" "}
            already has a complete schedule — every BOQ item is fully scheduled,
            with testing and handover (dates or NA).
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/schedules/plan/${contract.id}?mode=view`}
              className={cn(buttonVariants({ className: "bg-[var(--fh-steel)]" }))}
            >
              View schedule
            </Link>
            {canEdit && (
              <EditIconLink
                href={`/schedules/plan/${contract.id}?mode=edit`}
                label="Edit schedule"
              />
            )}
            {canEdit && (
              <DeleteIconButton
                label="Delete schedule"
                onClick={() => void onDelete()}
              />
            )}
            <Link
              href="/schedules/new"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Choose another contract
            </Link>
          </div>
          {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HubReturnLink
          href="/schedules"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Back to schedules
        </HubReturnLink>
        {mode === "edit" && (
          <Link
            href={`/schedules/plan/${contract.id}?mode=view`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            View schedule
          </Link>
        )}
      </div>

      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--fh-steel)]">
          {mode === "edit" ? "Edit schedule" : "Add schedule"} ·{" "}
          {contract.projectNo}
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-muted)]">{contract.projectName}</p>
        {coverage && !complete && (
          <p className="mt-1 text-xs text-[var(--fh-steel)]">
            Progress: {coverage.itemsComplete} of {coverage.itemsTotal} BOQ items
            fully covered
            {!coverage.hasTesting ? " · testing missing" : ""}
            {!coverage.hasHandover ? " · handover missing" : ""}
          </p>
        )}
      </header>

      <div
        className="space-y-5 rounded-xl border border-[var(--fh-line)] bg-white p-5"
        {...entryRootProps}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <ScheduleDateField
            label="Testing date"
            value={testingDate}
            onChange={(v) => {
              setFormDirty(true);
              setTestingEdited(true);
              setTestingDate(v);
            }}
            disabled={!canEdit}
          />
          <ScheduleDateField
            label="Handover date"
            value={handoverDate}
            onChange={(v) => {
              setFormDirty(true);
              setHandoverEdited(true);
              setHandoverDate(v);
            }}
            disabled={!canEdit}
          />
          <div className="space-y-1">
            <Label className="text-xs">Committed to client</Label>
            <select
              className="flex h-8 w-full rounded-lg border border-input px-2 text-sm"
              value={committed ? "yes" : "no"}
              onChange={(e) => {
                setFormDirty(true);
                setCommittedEdited(true);
                setCommitted(e.target.value === "yes");
              }}
              disabled={!canEdit}
            >
              <option value="no">Uncommitted</option>
              <option value="yes">Committed</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {items.map((it, itemIdx) => {
            const supplySum = sumQty(it.supplies);
            const installSum = sumQty(it.installations);
            const hasSupplyDate = it.supplies.some(
              (w) => w.startDate && !isScheduleDateNa(w.startDate)
            );
            return (
              <section
                key={it.boqItemId}
                className="rounded-lg border border-[var(--fh-line)] p-4"
              >
                <h2 className="font-medium text-[var(--fh-steel)]">
                  {it.name}{" "}
                  <span className="text-sm font-normal text-[var(--fh-muted)]">
                    · {formatMoney(it.rate)} · BOQ qty {it.boqQty} {it.unit}
                  </span>
                </h2>

                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                    Supply{" "}
                    <span className="normal-case tracking-normal">
                      ({supplySum}/{it.boqQty}
                      {supplySum === it.boqQty ? " · complete" : ""})
                    </span>
                  </p>
                  {it.supplies.map((w, wi) => (
                    <div
                      key={`s-${wi}`}
                      className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]"
                    >
                      <ScheduleDateField
                        label="Supply start"
                        value={w.startDate}
                        disabled={!canEdit}
                        onChange={(v) => {
                          const na = isScheduleDateNa(v);
                          updateWindow(itemIdx, "supplies", wi, {
                            startDate: v,
                            endDate: na
                              ? SCHEDULE_DATE_NA
                              : w.endDate === SCHEDULE_DATE_NA
                                ? ""
                                : w.endDate,
                            ...(na ? { quantity: "" } : {}),
                          });
                        }}
                      />
                      <ScheduleDateField
                        label="Supply end"
                        value={w.endDate}
                        disabled={!canEdit || isScheduleDateNa(w.startDate)}
                        onChange={(v) =>
                          updateWindow(itemIdx, "supplies", wi, {
                            endDate: v,
                          })
                        }
                      />
                      <div className="space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={w.quantity}
                          disabled={!canEdit || isScheduleDateNa(w.startDate)}
                          onChange={(e) =>
                            updateWindow(itemIdx, "supplies", wi, {
                              quantity: e.target.value,
                            })
                          }
                          onBlur={() => onQtyBlur(itemIdx, "supplies")}
                        />
                      </div>
                    </div>
                  ))}
                  {supplySum > 0 && supplySum < it.boqQty && (
                    <p className="text-xs text-[var(--fh-steel)]">
                      {it.boqQty - supplySum} of {it.boqQty} still to schedule —
                      another supply window opens when qty is short.
                    </p>
                  )}
                </div>

                {supplyMarkedNa(it.supplies) ? (
                  <p className="mt-4 text-xs text-[var(--fh-muted)]">
                    NA — this item is left out of the schedule. Supply qty and
                    other dates are not saved.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                      Installation{" "}
                      <span className="normal-case tracking-normal">
                        ({installSum}/{it.boqQty}
                        {installSum === it.boqQty ? " · complete" : ""})
                      </span>
                    </p>
                    {!hasSupplyDate && (
                      <p className="text-xs text-[var(--fh-muted)]">
                        Add a supply date for this item before scheduling
                        installation.
                      </p>
                    )}
                    {it.installations.map((w, wi) => (
                      <div
                        key={`i-${wi}`}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem]"
                      >
                        <ScheduleDateField
                          label="Install start"
                          value={w.startDate}
                          disabled={!canEdit || !hasSupplyDate}
                          onChange={(v) => {
                            const na = isScheduleDateNa(v);
                            updateWindow(itemIdx, "installations", wi, {
                              startDate: v,
                              endDate: na
                                ? SCHEDULE_DATE_NA
                                : w.endDate === SCHEDULE_DATE_NA
                                  ? ""
                                  : w.endDate,
                              ...(na ? { quantity: "" } : {}),
                            });
                          }}
                        />
                        <ScheduleDateField
                          label="Install end"
                          value={w.endDate}
                          disabled={
                            !canEdit ||
                            !hasSupplyDate ||
                            isScheduleDateNa(w.startDate)
                          }
                          onChange={(v) =>
                            updateWindow(itemIdx, "installations", wi, {
                              endDate: v,
                            })
                          }
                        />
                        <div className="space-y-1">
                          <Label className="text-xs">Qty</Label>
                          <Input
                            type="number"
                            value={w.quantity}
                            disabled={
                              !canEdit ||
                              !hasSupplyDate ||
                              isScheduleDateNa(w.startDate)
                            }
                            onChange={(e) =>
                              updateWindow(itemIdx, "installations", wi, {
                                quantity: e.target.value,
                              })
                            }
                            onBlur={() => onQtyBlur(itemIdx, "installations")}
                          />
                        </div>
                      </div>
                    ))}
                    {installSum > 0 && installSum < it.boqQty && (
                      <p className="text-xs text-[var(--fh-steel)]">
                        {it.boqQty - installSum} of {it.boqQty} still to
                        schedule for installation.
                      </p>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {err && <p className="text-sm text-[var(--destructive)]">{err}</p>}

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              type="button"
              {...entrySaveProps}
              className="bg-[var(--fh-steel)]"
              disabled={busy}
              onClick={() => void onSave()}
            >
              {formComplete ? "Save complete schedule" : "Save progress"}
            </Button>
          )}
          {canEdit &&
            data.schedules.some((s) => s.contractId === contractId) && (
              <DeleteIconButton
                label="Delete schedule"
                onClick={() => void onDelete()}
              />
            )}
          <HubReturnLink
            href="/schedules"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </HubReturnLink>
        </div>
      </div>
    </div>
  );
}
