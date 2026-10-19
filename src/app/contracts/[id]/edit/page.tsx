"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateContract, useFlowhubData } from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import { DLP_MONTHS_RANGE_MESSAGE, acceptedDlpMonths } from "@/lib/dlp-months";
import {
  draftFromContract,
  keepOpenContractEdit,
  type ContractEditDraft,
  type OpenContractEdit,
} from "@/lib/contract-edit-form";
import { entryRootProps, entrySaveProps } from "@/components/entry-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function EditContractPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { data: session, status } = useSession();
  const data = useFlowhubData();
  const contract = data.contracts.find((c) => c.id === id);

  const [open, setOpen] = useState<OpenContractEdit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpen((current) => keepOpenContractEdit(current, contract));
  }, [contract]);

  if (status === "loading") {
    return <p className="text-sm text-[var(--fh-muted)]">Loading…</p>;
  }

  if (session?.user?.clearance !== "master") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Only Master can edit contracts.</p>
        <Link href={`/contracts/${id}`} className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>
    );
  }

  if (!contract) {
    return <p className="text-sm text-[var(--fh-muted)]">Contract not found.</p>;
  }

  const draft =
    open?.contractId === contract.id ? open.draft : draftFromContract(contract);

  function change(key: keyof ContractEditDraft) {
    return (value: string) => {
      setOpen((current) => {
        const base =
          current?.contractId === contract.id
            ? current
            : keepOpenContractEdit(current, contract);
        if (!base) return current;
        return {
          contractId: base.contractId,
          draft: { ...base.draft, [key]: value },
        };
      });
    };
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(draft.orderValue);
    if (!draft.projectName.trim() || !draft.projectNo.trim() || !value) {
      setError("Fill name, project no., and order value.");
      return;
    }
    const dlp = acceptedDlpMonths(draft.dlpMonths);
    if (dlp == null) {
      setError(DLP_MONTHS_RANGE_MESSAGE);
      return;
    }
    updateContract(id, {
      projectName: draft.projectName.trim(),
      projectNo: draft.projectNo.trim(),
      orderNos: draft.orderNos.trim(),
      orderDate: draft.orderDate,
      closureDate: draft.closureDate,
      orderValue: value,
      city: draft.city.trim(),
      state: draft.state.trim(),
      country: draft.country.trim(),
      paymentDueDays: Number(draft.paymentDueDays) || 30,
      retentionPercent: Number(draft.retentionPercent) || 0,
      tdsPercent: Number(draft.tdsPercent) || 0,
      dlpMonths: dlp,
      contractorAssigned: draft.contractorAssigned.trim(),
    });
    const saved = await confirmWorkspaceSave();
    if (!saved) return;
    router.push(`/contracts/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Edit contract
        </h1>
        <p className="mt-1 text-sm text-[var(--fh-muted)]">{contract.projectNo}</p>
      </div>
      <form
        onSubmit={submit}
        {...entryRootProps}
        className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" value={draft.projectName} onChange={change("projectName")} />
          <Field label="Project no." value={draft.projectNo} onChange={change("projectNo")} />
          <Field label="Order no(s)" value={draft.orderNos} onChange={change("orderNos")} />
          <div className="space-y-2">
            <Label>Order date</Label>
            <Input type="date" value={draft.orderDate} onChange={(e) => change("orderDate")(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Closure date</Label>
            <Input
              type="date"
              value={draft.closureDate}
              onChange={(e) => change("closureDate")(e.target.value)}
            />
          </div>
          <Field label="Order value" value={draft.orderValue} onChange={change("orderValue")} type="number" />
          <Field label="City" value={draft.city} onChange={change("city")} />
          <Field label="State" value={draft.state} onChange={change("state")} />
          <Field label="Country" value={draft.country} onChange={change("country")} />
          <Field
            label="Payment due days"
            value={draft.paymentDueDays}
            onChange={change("paymentDueDays")}
            type="number"
          />
          <Field
            label="Retention %"
            value={draft.retentionPercent}
            onChange={change("retentionPercent")}
            type="number"
          />
          <Field label="TDS % of net" value={draft.tdsPercent} onChange={change("tdsPercent")} type="number" />
          <Field label="DLP months" value={draft.dlpMonths} onChange={change("dlpMonths")} type="number" />
          <Field
            label="Contractor assigned"
            value={draft.contractorAssigned}
            onChange={change("contractorAssigned")}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" {...entrySaveProps} className="bg-[var(--fh-steel)]">
            Save changes
          </Button>
          <Link href={`/contracts/${id}`} className={cn(buttonVariants({ variant: "outline" }))}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
