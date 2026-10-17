"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  commitContractBillingTerms,
  contractInvoiceUsesBillingTerm,
  deleteContract,
  flushWorkspace,
  updateContract,
  useFlowhubData,
} from "@/lib/store";
import {
  addCustomBillingTerm,
  billingTermLabel,
  billingTermsTotal,
  deleteCustomBillingTerm,
  isBuiltinBillingTerm,
  renameCustomBillingTerm,
} from "@/lib/billing-terms";
import {
  GST_RATE,
  canAmendBoq,
  canMarkRetentionRecovered,
  guaranteeAmount,
  guaranteeIdentitySaved,
  orderedBillingTermKeys,
  type BillingTerms,
} from "@/lib/types";
import { confirmAction } from "@/components/confirm-panel";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import {
  DeleteIconButton,
  EditIconButton,
  EditIconLink,
} from "@/components/icon-actions";
import {
  formatDisplayDate,
  formatDisplayDateTime,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { defaultAccess, mayMutate } from "@/lib/access";
import {
  acceptedHandoverDate,
  contractDisplayStatus,
  handoverDateToSave,
  storedContractStatus,
  todayIso,
} from "@/lib/nexus-core";
import { BoqSection } from "./boq-section";

type BillingEditorState = {
  id: string;
  terms: BillingTerms;
  renames: Record<string, string>;
  /** Draft key → saved key. Added terms are absent. */
  origins: Record<string, string>;
  error: string | null;
  editing: boolean;
};

function billingOrigins(terms: BillingTerms): Record<string, string> {
  return Object.fromEntries(Object.keys(terms).map((key) => [key, key]));
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export default function ContractDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { data: session } = useSession();
  const isMaster = session?.user?.clearance === "master";
  const canRecoverRetention = canMarkRetentionRecovered(
    session?.user?.clearance
  );
  const data = useFlowhubData();
  const contract = data.contracts.find((c) => c.id === id);

  const [abgNumber, setAbgNumber] = useState("");
  const [abgDate, setAbgDate] = useState("");
  const [abgExpiry, setAbgExpiry] = useState("");
  const [abgBankName, setAbgBankName] = useState("");
  const [abgAmount, setAbgAmount] = useState("");
  const [abgPercentDraft, setAbgPercentDraft] = useState("");
  const [editingAbg, setEditingAbg] = useState(false);
  const [abgRetrievedDate, setAbgRetrievedDate] = useState("");
  const [pbgNumber, setPbgNumber] = useState("");
  const [pbgDate, setPbgDate] = useState("");
  const [pbgExpiry, setPbgExpiry] = useState("");
  const [pbgBankName, setPbgBankName] = useState("");
  const [pbgAmount, setPbgAmount] = useState("");
  const [pbgPercentDraft, setPbgPercentDraft] = useState("");
  const [editingPbg, setEditingPbg] = useState(false);
  const [pbgRetrievedDate, setPbgRetrievedDate] = useState("");
  const [retentionRecoverDate, setRetentionRecoverDate] = useState("");
  const [contractor, setContractor] = useState("");
  const [handoverStep, setHandoverStep] = useState<"idle" | "date" | "confirm">(
    "idle"
  );
  const [handoverDraft, setHandoverDraft] = useState("");
  const [tdsEdit, setTdsEdit] = useState("");
  const [billingEditor, setBillingEditor] = useState<BillingEditorState | null>(
    null
  );
  const [newTermName, setNewTermName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const access =
    session?.user?.access ??
    defaultAccess(session?.user?.clearance ?? "user");
  const contractOpen = access.contracts === "edit";
  const canAmend =
    contractOpen &&
    mayMutate(
      access.contracts,
      canAmendBoq({
        clearance: session?.user?.clearance,
        department,
      }),
      Boolean(session?.user?.accessCustom)
    );
  const actorName =
    session?.user?.name?.trim() || session?.user?.email || "User";

  useEffect(() => {
    const role = session?.user?.clearance;
    if (!role || role === "master" || role === "director") return;
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { department?: string | null } | null) => {
        if (!cancelled) setDepartment(body?.department ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.user?.clearance]);

  useEffect(() => {
    setHandoverStep("idle");
    setHandoverDraft("");
  }, [id]);

  useEffect(() => {
    if (!contract) return;
    setAbgAmount(contract.abgValue != null ? String(contract.abgValue) : "");
  }, [contract?.id, contract?.abgValue]);

  useEffect(() => {
    if (!contract) return;
    setPbgAmount(contract.pbgValue != null ? String(contract.pbgValue) : "");
  }, [contract?.id, contract?.pbgValue]);

  useEffect(() => {
    if (!contract) return;
    setBillingEditor((current) => {
      if (current?.id === contract.id) return current;
      return {
        id: contract.id,
        terms: { ...contract.billingTerms },
        renames: {},
        origins: billingOrigins(contract.billingTerms),
        error: null,
        editing: false,
      };
    });
  }, [contract]);

  // Notification deep-links land on #abg / #pbg / #retention with the entry form open.
  useEffect(() => {
    if (!contract) return;
    const hash = window.location.hash.replace(/^#/, "").toLowerCase();
    if (!hash) return;
    if (
      (hash === "abg" || hash === "guarantees") &&
      !contract.abgRetrieved
    ) {
      setAbgPercentDraft(
        contract.abgPercent != null ? String(contract.abgPercent) : ""
      );
      setEditingAbg(true);
    }
    if (
      (hash === "pbg" || hash === "guarantees") &&
      !contract.pbgRetrieved
    ) {
      setPbgPercentDraft(
        contract.pbgPercent != null ? String(contract.pbgPercent) : ""
      );
      setEditingPbg(true);
    }
    const targetId =
      hash === "abg" || hash === "pbg"
        ? hash
        : hash === "guarantees"
          ? "guarantees"
          : hash === "retention"
            ? "retention"
            : hash;
    const t = window.setTimeout(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [contract, id]);

  if (!contract) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-[var(--fh-muted)]">Contract not found.</p>
        <Link href="/contracts" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to contracts
        </Link>
      </div>
    );
  }

  const c = contract;
  const latestAmendment = c.amendments[c.amendments.length - 1];
  const abgFilled = Boolean(c.abgNumber && c.abgDate && c.abgExpiry);
  const pbgFilled = Boolean(c.pbgNumber && c.pbgDate && c.pbgExpiry);
  const abgAmt =
    c.abgValue ?? guaranteeAmount(c.orderValue, c.abgPercent) ?? 0;
  const pbgAmt =
    c.pbgValue ?? guaranteeAmount(c.orderValue, c.pbgPercent) ?? 0;

  async function saveAbg(e: FormEvent) {
    e.preventDefault();
    if (c.abgRetrieved) return;
    const adding = !c.abgRequired;
    if (adding && !contractOpen) return;
    const nextNumber = abgNumber.trim() || c.abgNumber;
    const nextDate = abgDate || c.abgDate;
    const nextExpiry = abgExpiry || c.abgExpiry;
    const nextBank =
      abgBankName.trim() || c.abgBankName || null;
    const wasFilled = abgFilled;
    updateContract(
      id,
      {
        ...(adding
          ? {
              abgRequired: true,
              abgPercent: parseGuaranteePercent(abgPercentDraft, c.abgPercent),
            }
          : {}),
        abgNumber: nextNumber,
        abgDate: nextDate,
        abgExpiry: nextExpiry,
        abgBankName: nextBank,
        abgValue: parseGuaranteeAmount(abgAmount, c.abgValue),
      },
      {
        editedBy: session?.user?.name || session?.user?.email || "User",
        trackGuarantee: wasFilled ? "ABG" : undefined,
      }
    );
    await flushWorkspace();
    setEditingAbg(false);
    setAbgNumber("");
    setAbgDate("");
    setAbgExpiry("");
    setAbgBankName("");
    setAbgPercentDraft("");
    const complete = Boolean(nextNumber && nextDate && nextExpiry);
    setMsg(
      wasFilled
        ? "ABG details updated (edit recorded)."
        : adding
          ? complete
            ? "ABG saved and marked required."
            : "ABG marked required. Create ABG task completes when number, date, and expiry are filled."
          : "ABG details saved. Create ABG task completes when number, date, and expiry are filled."
    );
  }

  async function savePbg(e: FormEvent) {
    e.preventDefault();
    if (c.pbgRetrieved) return;
    const adding = !c.pbgRequired;
    if (adding && !contractOpen) return;
    const nextNumber = pbgNumber.trim() || c.pbgNumber;
    const nextDate = pbgDate || c.pbgDate;
    const nextExpiry = pbgExpiry || c.pbgExpiry;
    const nextBank =
      pbgBankName.trim() || c.pbgBankName || null;
    const wasFilled = pbgFilled;
    updateContract(
      id,
      {
        ...(adding
          ? {
              pbgRequired: true,
              pbgPercent: parseGuaranteePercent(pbgPercentDraft, c.pbgPercent),
            }
          : {}),
        pbgNumber: nextNumber,
        pbgDate: nextDate,
        pbgExpiry: nextExpiry,
        pbgBankName: nextBank,
        pbgValue: parseGuaranteeAmount(pbgAmount, c.pbgValue),
      },
      {
        editedBy: session?.user?.name || session?.user?.email || "User",
        trackGuarantee: wasFilled ? "PBG" : undefined,
      }
    );
    await flushWorkspace();
    setEditingPbg(false);
    setPbgNumber("");
    setPbgDate("");
    setPbgExpiry("");
    setPbgBankName("");
    setPbgPercentDraft("");
    const complete = Boolean(nextNumber && nextDate && nextExpiry);
    setMsg(
      wasFilled
        ? "PBG details updated (edit recorded)."
        : adding
          ? complete
            ? "PBG saved and marked required."
            : "PBG marked required. Create PBG task completes when number, date, and expiry are filled."
          : "PBG details saved. Create PBG task completes when number, date, and expiry are filled."
    );
  }

  async function markAbgNotRequired() {
    if (!contractOpen || c.abgRetrieved) return;
    if (guaranteeIdentitySaved(c.abgNumber, c.abgDate, c.abgBankName)) return;
    updateContract(id, { abgRequired: false });
    await flushWorkspace();
    setEditingAbg(false);
    setMsg("ABG marked not required. Open create and expiry tasks are closed.");
  }

  async function markPbgNotRequired() {
    if (!contractOpen || c.pbgRetrieved) return;
    if (guaranteeIdentitySaved(c.pbgNumber, c.pbgDate, c.pbgBankName)) return;
    updateContract(id, { pbgRequired: false });
    await flushWorkspace();
    setEditingPbg(false);
    setMsg("PBG marked not required. Open create and expiry tasks are closed.");
  }

  async function markAbgRetrieved(e: FormEvent) {
    e.preventDefault();
    if (c.abgRetrieved) return;
    const date = abgRetrievedDate || c.abgRetrievedDate;
    if (!date) {
      setMsg("Enter the ABG retrieval date.");
      return;
    }
    updateContract(
      id,
      { abgRetrieved: true, abgRetrievedDate: date },
      {
        editedBy: session?.user?.name || session?.user?.email || "User",
        trackGuarantee: "ABG",
      }
    );
    await flushWorkspace();
    setAbgRetrievedDate("");
    setEditingAbg(false);
    setMsg(`ABG marked as retrieved / taken back on ${date}.`);
  }

  async function markPbgRetrieved(e: FormEvent) {
    e.preventDefault();
    if (c.pbgRetrieved) return;
    const date = pbgRetrievedDate || c.pbgRetrievedDate;
    if (!date) {
      setMsg("Enter the PBG retrieval date.");
      return;
    }
    updateContract(
      id,
      { pbgRetrieved: true, pbgRetrievedDate: date },
      {
        editedBy: session?.user?.name || session?.user?.email || "User",
        trackGuarantee: "PBG",
      }
    );
    await flushWorkspace();
    setPbgRetrievedDate("");
    setEditingPbg(false);
    setMsg(`PBG marked as retrieved / taken back on ${date}.`);
  }

  async function markRetentionRecovered(e: FormEvent) {
    e.preventDefault();
    if (!canRecoverRetention) return;
    const date = retentionRecoverDate.trim();
    if (!date) {
      setMsg("Enter the retention recovery date.");
      return;
    }
    updateContract(id, { retentionRecoveredAt: date });
    await flushWorkspace();
    setRetentionRecoverDate("");
    setMsg(`Retention marked recovered on ${date}.`);
  }

  async function clearRetentionRecovered() {
    if (!canRecoverRetention || !isMaster) return;
    updateContract(id, { retentionRecoveredAt: null });
    await flushWorkspace();
    setMsg("Retention recovery cleared.");
  }

  async function saveContractor(e: FormEvent) {
    e.preventDefault();
    updateContract(id, {
      contractorAssigned: (contractor || c.contractorAssigned).trim(),
    });
    await flushWorkspace();
    setContractor("");
    setMsg("Contractor assignment saved.");
  }

  function startHandover() {
    setHandoverDraft(contract?.handoverDate ?? "");
    setHandoverStep("date");
  }

  function askHandoverConfirm(e: FormEvent) {
    e.preventDefault();
    if (!acceptedHandoverDate(handoverDraft)) {
      setMsg("Enter a handover date.");
      return;
    }
    setHandoverStep("confirm");
  }

  async function confirmHandover() {
    const date = handoverDateToSave(handoverDraft, true);
    if (!date) {
      setMsg("Enter a handover date.");
      setHandoverStep("date");
      return;
    }
    updateContract(id, { handoverDate: date });
    await flushWorkspace();
    setHandoverStep("idle");
    setHandoverDraft("");
    setMsg("Handover date saved.");
  }

  const billingEditing =
    contractOpen && billingEditor?.id === c.id && billingEditor.editing;
  const termsForEdit =
    billingEditing && billingEditor ? billingEditor.terms : c.billingTerms;
  const renameDrafts =
    billingEditing && billingEditor ? billingEditor.renames : {};
  const billingOriginsForEdit =
    billingEditing && billingEditor
      ? billingEditor.origins
      : billingOrigins(c.billingTerms);
  const billingError =
    billingEditing && billingEditor ? billingEditor.error : null;
  const billingTotal = billingTermsTotal(termsForEdit);

  function patchBillingEditor(
    patch: (current: BillingEditorState) => BillingEditorState
  ) {
    setBillingEditor((current) => {
      const base =
        current && current.id === id
          ? current
          : {
              id,
              terms: { ...c.billingTerms },
              renames: {},
              origins: billingOrigins(c.billingTerms),
              error: null,
              editing: true,
            };
      return patch(base);
    });
  }

  function startBillingEdit() {
    if (!contractOpen) return;
    setBillingEditor({
      id,
      terms: { ...c.billingTerms },
      renames: {},
      origins: billingOrigins(c.billingTerms),
      error: null,
      editing: true,
    });
    setNewTermName("");
  }

  function cancelBillingEdit() {
    setBillingEditor((current) =>
      current && current.id === id
        ? { ...current, editing: false, error: null, renames: {} }
        : current
    );
    setNewTermName("");
  }

  function addSavedTerm() {
    const result = addCustomBillingTerm(termsForEdit, newTermName);
    if (!result.ok) {
      if (newTermName.trim()) {
        patchBillingEditor((current) => ({ ...current, error: result.error }));
      }
      return;
    }
    patchBillingEditor((current) => ({
      ...current,
      terms: result.terms,
      error: null,
    }));
    setNewTermName("");
  }

  function renameSavedTerm(fromKey: string) {
    const raw = renameDrafts[fromKey] ?? "";
    patchBillingEditor((current) => {
      const renamed = renameCustomBillingTerm(current.terms, fromKey, raw);
      if (!renamed.ok) return { ...current, error: renamed.error };
      const renames = { ...current.renames };
      delete renames[fromKey];
      const origins = { ...current.origins };
      if (Object.prototype.hasOwnProperty.call(origins, fromKey)) {
        origins[renamed.toKey] = origins[fromKey];
        if (renamed.toKey !== fromKey) delete origins[fromKey];
      }
      return { ...current, terms: renamed.terms, renames, origins, error: null };
    });
  }

  async function deleteSavedTerm(key: string) {
    const label = billingTermLabel(key);
    const confirmed = await confirmAction({
      message: `Delete the ${label} billing term from this contract?`,
      action: "Delete",
    });
    if (!confirmed) return;
    const original = billingOriginsForEdit[key];
    if (
      original &&
      contractInvoiceUsesBillingTerm(id, original)
    ) {
      patchBillingEditor((current) => ({
        ...current,
        error: "This term is used on an invoice and cannot be deleted.",
      }));
      return;
    }
    patchBillingEditor((current) => {
      const removed = deleteCustomBillingTerm(current.terms, key);
      if (!removed.ok) return { ...current, error: removed.error };
      const renames = { ...current.renames };
      delete renames[key];
      const origins = { ...current.origins };
      delete origins[key];
      return { ...current, terms: removed.terms, renames, origins, error: null };
    });
  }

  async function saveBillingTerms(e: FormEvent) {
    e.preventDefault();
    const result = commitContractBillingTerms(
      id,
      termsForEdit,
      billingOriginsForEdit
    );
    if (!result.ok) {
      patchBillingEditor((current) => ({ ...current, error: result.error }));
      return;
    }
    setBillingEditor((current) =>
      current && current.id === id
        ? {
            ...current,
            terms: { ...termsForEdit },
            origins: billingOrigins(termsForEdit),
            renames: {},
            error: null,
            editing: false,
          }
        : current
    );
    setNewTermName("");
    await flushWorkspace();
    setMsg("Billing terms saved.");
  }

  async function saveTds(e: FormEvent) {
    e.preventDefault();
    const next = Number(tdsEdit);
    if (Number.isNaN(next) || next < 0 || next > 100) {
      setMsg("TDS % must be between 0 and 100.");
      return;
    }
    updateContract(id, { tdsPercent: next });
    await flushWorkspace();
    setTdsEdit("");
    setMsg("TDS % saved.");
  }

  async function saveStatus(label: "Active" | "On hold") {
    if (!contractOpen || !contract) return;
    if (contractDisplayStatus(data, contract, todayIso()) === "Completed") return;
    updateContract(id, { status: storedContractStatus(label) });
    await flushWorkspace();
    setMsg(`Status set to ${label}.`);
  }

  async function onDelete() {
    if (!isMaster) return;
    if (
      !(await confirmAction({
        message: `Delete contract ${c.projectNo}? This cannot be undone.`,
        action: "Delete",
      }))
    ) {
      return;
    }
    deleteContract(id);
    await flushWorkspace();
    router.push("/contracts");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            {c.projectNo}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            {c.projectName}
          </h1>
          <p className="mt-1 text-sm text-[var(--fh-muted)]">
            {c.city}, {c.state}, {c.country}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contractDisplayStatus(data, c, todayIso()) === "Completed" ||
          !contractOpen ? (
            <Badge>{contractDisplayStatus(data, c, todayIso())}</Badge>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--fh-muted)]">
                Status
              </span>
              <select
                aria-label="Status"
                value={contractDisplayStatus(data, c, todayIso())}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "Active" || next === "On hold") {
                    void saveStatus(next);
                  }
                }}
                className="h-8 rounded-lg border border-input bg-white px-2 text-sm text-[var(--fh-ink)]"
              >
                <option value="Active">Active</option>
                <option value="On hold">On hold</option>
              </select>
            </label>
          )}
          {isMaster && contractOpen && (
            <>
              <EditIconLink
                href={`/contracts/${c.id}/edit`}
                label="Edit contract"
              />
              <DeleteIconButton
                label="Delete contract"
                onClick={onDelete}
              />
            </>
          )}
        </div>
      </div>

      {msg && (
        <p className="rounded-md border border-[var(--fh-line)] bg-white px-3 py-2 text-sm text-[var(--fh-steel)]">
          {msg}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Order no(s)" value={c.orderNos} />
        <Info label="Order date" value={formatDisplayDate(c.orderDate)} />
        <Info
          label="Closure date"
          value={formatDisplayDate(c.closureDate)}
        />
        <Info
          label="Order value"
          value={
            latestAmendment
              ? `${formatMoney(c.orderValue)} · amended ${latestAmendment.number} (${formatDisplayDate(latestAmendment.date)})`
              : formatMoney(c.orderValue)
          }
        />
        <Info
          label="GST"
          value={
            c.gstApplicable
              ? `18% · w/ GST ${formatMoney(c.orderValue * (1 + GST_RATE))}`
              : "Not applicable"
          }
        />
        <Info label="Payment due days" value={`${c.paymentDueDays} days`} />
        <div
          id="retention"
          className="scroll-mt-20 rounded-lg border border-[var(--fh-line)] bg-white p-4 sm:col-span-2 lg:col-span-1"
        >
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            Retention
          </p>
          <p className="mt-1 text-sm font-medium">
            {c.retentionPercent}% of net
          </p>
          {c.retentionRecoveredAt ? (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-emerald-800">
                Recovered on{" "}
                <strong>{formatDisplayDate(c.retentionRecoveredAt)}</strong>
              </p>
              {canRecoverRetention && isMaster && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearRetentionRecovered}
                >
                  Clear recovery
                </Button>
              )}
            </div>
          ) : canRecoverRetention && c.retentionPercent > 0 ? (
            <form
              onSubmit={markRetentionRecovered}
              {...entryRootProps}
              className="mt-3 space-y-2 border-t border-[var(--fh-line)] pt-3"
            >
              <p className="text-xs text-[var(--fh-muted)]">
                Mark when retention held on this contract has been recovered as
                a whole.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1">
                  <Label>Recovery date</Label>
                  <Input
                    type="date"
                    value={retentionRecoverDate}
                    onChange={(e) => setRetentionRecoverDate(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  {...entrySaveProps}
                  size="sm"
                  className="bg-[var(--fh-steel)]"
                >
                  Mark recovered
                </Button>
              </div>
            </form>
          ) : null}
        </div>
        <div className="rounded-lg border border-[var(--fh-line)] bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">
            TDS % of net
          </p>
          <form
            onSubmit={saveTds}
            {...entryRootProps}
            className="mt-2 flex items-center gap-2"
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={tdsEdit}
              onChange={(e) => setTdsEdit(e.target.value)}
              placeholder={String(c.tdsPercent)}
              className="h-8 w-20"
              aria-label="TDS percent"
            />
            <Button
              type="submit"
              {...entrySaveProps}
              size="sm"
              variant="outline"
              className="h-8 px-2.5"
            >
              Save
            </Button>
          </form>
        </div>
        <Info
          label="DLP period"
          value={`${c.dlpMonths} months from actual handover`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
            Contractor assigned
          </h2>
          <p className="mt-3 text-sm font-medium">
            {c.contractorAssigned || (
              <span className="text-[var(--fh-muted)]">Not assigned yet</span>
            )}
          </p>
          <form
            onSubmit={saveContractor}
            {...entryRootProps}
            className="mt-3 flex flex-wrap gap-2"
          >
            <Input
              value={contractor}
              onChange={(e) => setContractor(e.target.value)}
              placeholder={c.contractorAssigned || "Contractor name"}
              className="max-w-sm"
            />
            <Button
              type="submit"
              {...entrySaveProps}
              size="sm"
              className="bg-[var(--fh-steel)]"
            >
              Save
            </Button>
          </form>
        </section>

        <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
            Handover
          </h2>
          <p className="mt-3 text-sm font-medium">
            {c.handoverDate ? (
              formatDisplayDate(c.handoverDate)
            ) : (
              <span className="text-[var(--fh-muted)]">Not handed over</span>
            )}
          </p>
          {handoverStep === "idle" ? (
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-[var(--fh-steel)]"
              onClick={startHandover}
            >
              Handover
            </Button>
          ) : handoverStep === "date" ? (
            <form
              onSubmit={askHandoverConfirm}
              {...entryRootProps}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <div className="space-y-1">
                <Label htmlFor="contract-handover-date">Handover date</Label>
                <Input
                  id="contract-handover-date"
                  type="date"
                  value={handoverDraft}
                  onChange={(e) => setHandoverDraft(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" size="sm" variant="outline">
                Continue
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setHandoverStep("idle")}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-[var(--fh-ink)]">
                Save handover date {formatDisplayDate(handoverDraft)}? This
                replaces the date on the contract.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  {...entrySaveProps}
                  size="sm"
                  className="bg-[var(--fh-steel)]"
                  onClick={() => void confirmHandover()}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setHandoverStep("date")}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
            Billing terms
          </h2>
          {billingEditing ? (
            <Badge
              variant={
                Math.abs(billingTotal - 100) < 0.01 ? "default" : "destructive"
              }
            >
              Total {billingTotal}%
            </Badge>
          ) : contractOpen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startBillingEdit}
            >
              Edit
            </Button>
          ) : null}
        </div>
        {billingEditing ? (
          <form
            onSubmit={saveBillingTerms}
            {...entryRootProps}
            className="mt-3 space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {orderedBillingTermKeys(termsForEdit).map((key) => {
                const label = billingTermLabel(key);
                const custom = !isBuiltinBillingTerm(key);
                return (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={termsForEdit[key] ?? 0}
                      aria-label={`${label} percent`}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        patchBillingEditor((current) => ({
                          ...current,
                          terms: { ...current.terms, [key]: value },
                          error: null,
                        }));
                      }}
                    />
                    {custom && (
                      <div className="flex flex-wrap gap-2">
                        <Input
                          placeholder="Rename term"
                          value={renameDrafts[key] ?? ""}
                          aria-label={`Rename ${label}`}
                          onChange={(e) => {
                            const value = e.target.value;
                            patchBillingEditor((current) => ({
                              ...current,
                              renames: { ...current.renames, [key]: value },
                            }));
                          }}
                          className="max-w-xs"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => renameSavedTerm(key)}
                        >
                          Rename
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void deleteSavedTerm(key)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Add custom term name"
                value={newTermName}
                onChange={(e) => setNewTermName(e.target.value)}
                className="max-w-xs"
                aria-label="Add custom term name"
              />
              <Button type="button" variant="outline" onClick={addSavedTerm}>
                Add term
              </Button>
            </div>
            {billingError && (
              <p
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                role="alert"
              >
                {billingError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                {...entrySaveProps}
                className="bg-[var(--fh-steel)] hover:bg-[#244a5e]"
              >
                Save billing terms
              </Button>
              <Button type="button" variant="outline" onClick={cancelBillingEdit}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {orderedBillingTermKeys(c.billingTerms).map((k) => (
              <li key={k} className="flex justify-between text-sm">
                <span>{billingTermLabel(k)}</span>
                <span className="tabular-nums font-medium">
                  {c.billingTerms[k]}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="guarantees"
        className="rounded-xl border border-[var(--fh-line)] bg-white p-5 scroll-mt-20"
      >
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--fh-steel)]">
          Bank guarantees
        </h2>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <GuaranteeBlock
            title="ABG"
            required={c.abgRequired}
            filled={abgFilled}
            editing={editingAbg}
            setEditing={(open) => {
              if (open) {
                setAbgPercentDraft(
                  c.abgPercent != null ? String(c.abgPercent) : ""
                );
              }
              setEditingAbg(open);
            }}
            percent={c.abgPercent}
            amount={abgAmt}
            number={c.abgNumber}
            date={c.abgDate}
            expiry={c.abgExpiry}
            bankName={c.abgBankName}
            retrieved={c.abgRetrieved}
            retrievedDate={c.abgRetrievedDate}
            formNumber={abgNumber}
            setFormNumber={setAbgNumber}
            formDate={abgDate}
            setFormDate={setAbgDate}
            formExpiry={abgExpiry}
            setFormExpiry={setAbgExpiry}
            formBankName={abgBankName}
            setFormBankName={setAbgBankName}
            formAmount={abgAmount}
            setFormAmount={setAbgAmount}
            formPercent={abgPercentDraft}
            setFormPercent={setAbgPercentDraft}
            canAdd={contractOpen}
            canMarkNotRequired={
              contractOpen &&
              c.abgRequired &&
              !c.abgRetrieved &&
              !guaranteeIdentitySaved(c.abgNumber, c.abgDate, c.abgBankName)
            }
            onMarkNotRequired={() => void markAbgNotRequired()}
            formRetrievedDate={abgRetrievedDate}
            setFormRetrievedDate={setAbgRetrievedDate}
            onSave={saveAbg}
            onMarkRetrieved={markAbgRetrieved}
          />
          <GuaranteeBlock
            title="PBG"
            required={c.pbgRequired}
            filled={pbgFilled}
            editing={editingPbg}
            setEditing={(open) => {
              if (open) {
                setPbgPercentDraft(
                  c.pbgPercent != null ? String(c.pbgPercent) : ""
                );
              }
              setEditingPbg(open);
            }}
            percent={c.pbgPercent}
            amount={pbgAmt}
            number={c.pbgNumber}
            date={c.pbgDate}
            expiry={c.pbgExpiry}
            bankName={c.pbgBankName}
            retrieved={c.pbgRetrieved}
            retrievedDate={c.pbgRetrievedDate}
            formNumber={pbgNumber}
            setFormNumber={setPbgNumber}
            formDate={pbgDate}
            setFormDate={setPbgDate}
            formExpiry={pbgExpiry}
            setFormExpiry={setPbgExpiry}
            formBankName={pbgBankName}
            setFormBankName={setPbgBankName}
            formAmount={pbgAmount}
            setFormAmount={setPbgAmount}
            formPercent={pbgPercentDraft}
            setFormPercent={setPbgPercentDraft}
            canAdd={contractOpen}
            canMarkNotRequired={
              contractOpen &&
              c.pbgRequired &&
              !c.pbgRetrieved &&
              !guaranteeIdentitySaved(c.pbgNumber, c.pbgDate, c.pbgBankName)
            }
            onMarkNotRequired={() => void markPbgNotRequired()}
            formRetrievedDate={pbgRetrievedDate}
            setFormRetrievedDate={setPbgRetrievedDate}
            onSave={savePbg}
            onMarkRetrieved={markPbgRetrieved}
          />
        </div>
        {(c.guaranteeEdits ?? []).length > 0 && (
          <div className="mt-6 border-t border-[var(--fh-line)] pt-4">
            <h3 className="text-sm font-medium text-[var(--fh-steel)]">
              Guarantee edit history
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-[var(--fh-muted)]">
              {[...(c.guaranteeEdits ?? [])].reverse().map((e) => (
                <li key={e.id}>
                  {formatDisplayDateTime(e.at)} · {e.by} · {e.kind}:{" "}
                  {e.summary}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <BoqSection
        contract={c}
        canEdit={contractOpen}
        canAmend={canAmend}
        actorName={actorName}
        onMessage={setMsg}
      />
    </div>
  );
}

function parseGuaranteeAmount(
  raw: string,
  fallback: number | null
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

function parseGuaranteePercent(
  raw: string,
  fallback: number | null
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--fh-line)] bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--fh-muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function GuaranteeBlock({
  title,
  required,
  filled,
  editing,
  setEditing,
  percent,
  amount,
  number,
  date,
  expiry,
  bankName,
  retrieved,
  retrievedDate,
  formNumber,
  setFormNumber,
  formDate,
  setFormDate,
  formExpiry,
  setFormExpiry,
  formBankName,
  setFormBankName,
  formAmount,
  setFormAmount,
  formPercent,
  setFormPercent,
  canAdd,
  canMarkNotRequired,
  onMarkNotRequired,
  formRetrievedDate,
  setFormRetrievedDate,
  onSave,
  onMarkRetrieved,
}: {
  title: string;
  required: boolean;
  filled: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  percent: number | null;
  amount: number;
  number: string | null;
  date: string | null;
  expiry: string | null;
  bankName: string | null;
  retrieved: boolean;
  retrievedDate: string | null;
  formNumber: string;
  setFormNumber: (v: string) => void;
  formDate: string;
  setFormDate: (v: string) => void;
  formExpiry: string;
  setFormExpiry: (v: string) => void;
  formBankName: string;
  setFormBankName: (v: string) => void;
  formAmount: string;
  setFormAmount: (v: string) => void;
  formPercent: string;
  setFormPercent: (v: string) => void;
  canAdd: boolean;
  canMarkNotRequired: boolean;
  onMarkNotRequired: () => void;
  formRetrievedDate: string;
  setFormRetrievedDate: (v: string) => void;
  onSave: (e: FormEvent) => void;
  onMarkRetrieved: (e: FormEvent) => void;
}) {
  const anchor = title.toLowerCase();

  if (!required) {
    return (
      <div
        id={anchor}
        className="space-y-3 rounded-lg border border-[var(--fh-line)] p-4 scroll-mt-20"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{title} (not required)</p>
          {canAdd && !editing && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              Add
            </Button>
          )}
        </div>
        {canAdd && editing && (
          <form onSubmit={onSave} {...entryRootProps} className="grid gap-2">
            <div className="space-y-1">
              <Label>Percent</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formPercent}
                onChange={(e) => setFormPercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{title} number</Label>
              <Input
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                placeholder="Enter when issued"
              />
            </div>
            <div className="space-y-1">
              <Label>Creation date</Label>
              <Input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Expiry date</Label>
              <Input
                type="date"
                value={formExpiry}
                onChange={(e) => setFormExpiry(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Bank name</Label>
              <Input
                value={formBankName}
                onChange={(e) => setFormBankName(e.target.value)}
                placeholder="Issuing bank"
              />
            </div>
            <div className="space-y-1">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
              <p className="text-xs text-[var(--fh-muted)]">
                A typed amount is saved as entered. It is not replaced by
                percent × order value.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                {...entrySaveProps}
                size="sm"
                className="bg-[var(--fh-steel)]"
              >
                Save {title} details
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Once retrieved with a date: locked read-only — details plus retrieval line.
  if (retrieved && retrievedDate) {
    return (
      <div
        id={anchor}
        className="space-y-2 rounded-lg border border-[var(--fh-line)] p-4 scroll-mt-20"
      >
        <p className="text-sm font-medium">
          {title}{" "}
          <span className="text-[var(--fh-muted)]">
            · {percent ?? 0}% · {formatMoney(amount)}
          </span>
        </p>
        <p className="text-sm">
          No. <strong>{number || "—"}</strong>
          <br />
          Date {formatDisplayDate(date)} · Expiry {formatDisplayDate(expiry)}
          {bankName ? (
            <>
              <br />
              Bank <strong>{bankName}</strong>
            </>
          ) : null}
        </p>
        <p className="text-sm text-emerald-800">
          <strong>Retrieved</strong> · Retrieval date{" "}
          <strong>{formatDisplayDate(retrievedDate)}</strong>
        </p>
      </div>
    );
  }

  const showForm = !filled || editing;

  return (
    <div
      id={anchor}
      className="space-y-3 rounded-lg border border-[var(--fh-line)] p-4 scroll-mt-20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {title}{" "}
          {!filled ? (
            <span className="text-red-700">(required)</span>
          ) : (
            <span className="text-[var(--fh-muted)]">
              · {percent ?? 0}% · {formatMoney(amount)}
            </span>
          )}
        </p>
        {canMarkNotRequired && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onMarkNotRequired}
          >
            Not required
          </Button>
        )}
      </div>
      {!filled && (
        <p className="text-xs text-[var(--fh-muted)]">
          Enter number, creation date, expiry, bank, and the rupee amount.
          The percent stays {percent ?? 0}%. The task stays pending until
          number, date, and expiry are filled.
        </p>
      )}
      {filled && !editing && (
        <>
          <p className="text-sm">
            No. <strong>{number}</strong>
            <br />
            Date {formatDisplayDate(date)} · Expiry{" "}
            {formatDisplayDate(expiry)}
            {bankName ? (
              <>
                <br />
                Bank <strong>{bankName}</strong>
              </>
            ) : null}
          </p>
          <EditIconButton
            label={`Edit ${title}`}
            onClick={() => {
              setFormBankName(bankName ?? "");
              setEditing(true);
            }}
          />
          <form
            onSubmit={onMarkRetrieved}
            {...entryRootProps}
            className="space-y-2 rounded-md border border-[var(--fh-line)] bg-[var(--fh-bg)] p-3"
          >
            <p className="text-xs text-[var(--fh-muted)]">
              Mark when the bank guarantee is retrieved / taken back. Enter the
              retrieval date. After that, details become locked.
            </p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label>Retrieval date</Label>
                <Input
                  type="date"
                  value={formRetrievedDate}
                  onChange={(e) => setFormRetrievedDate(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                {...entrySaveProps}
                size="sm"
                className="bg-[var(--fh-steel)]"
              >
                Mark retrieved
              </Button>
            </div>
          </form>
        </>
      )}
      {showForm && (
        <form onSubmit={onSave} {...entryRootProps} className="grid gap-2">
          <div className="space-y-1">
            <Label>{title} number</Label>
            <Input
              value={formNumber}
              onChange={(e) => setFormNumber(e.target.value)}
              placeholder={number ?? "Enter when issued"}
            />
          </div>
          <div className="space-y-1">
            <Label>Creation date</Label>
            <Input
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Expiry date</Label>
            <Input
              type="date"
              value={formExpiry}
              onChange={(e) => setFormExpiry(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Bank name</Label>
            <Input
              value={formBankName}
              onChange={(e) => setFormBankName(e.target.value)}
              placeholder={bankName ?? "Issuing bank"}
            />
          </div>
          <div className="space-y-1">
            <Label>Amount (₹)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
            <p className="text-xs text-[var(--fh-muted)]">
              Percent stays {percent ?? 0}%. A saved amount is not reset from
              the order value.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="submit"
              {...entrySaveProps}
              size="sm"
              className="bg-[var(--fh-steel)]"
            >
              Save {title} details
            </Button>
            {filled && editing && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
