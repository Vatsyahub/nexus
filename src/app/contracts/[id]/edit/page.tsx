"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { updateContract, useFlowhubData } from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import { DLP_MONTHS_RANGE_MESSAGE, acceptedDlpMonths } from "@/lib/dlp-months";
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

  const [projectName, setProjectName] = useState("");
  const [projectNo, setProjectNo] = useState("");
  const [orderNos, setOrderNos] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [closureDate, setClosureDate] = useState("");
  const [orderValue, setOrderValue] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [paymentDueDays, setPaymentDueDays] = useState("");
  const [retentionPercent, setRetentionPercent] = useState("");
  const [tdsPercent, setTdsPercent] = useState("");
  const [dlpMonths, setDlpMonths] = useState("");
  const [contractorAssigned, setContractorAssigned] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contract) return;
    setProjectName(contract.projectName);
    setProjectNo(contract.projectNo);
    setOrderNos(contract.orderNos);
    setOrderDate(contract.orderDate);
    setClosureDate(contract.closureDate);
    setOrderValue(String(contract.orderValue));
    setCity(contract.city);
    setState(contract.state);
    setCountry(contract.country);
    setPaymentDueDays(String(contract.paymentDueDays));
    setRetentionPercent(String(contract.retentionPercent));
    setTdsPercent(String(contract.tdsPercent));
    setDlpMonths(String(contract.dlpMonths));
    setContractorAssigned(contract.contractorAssigned || "");
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(orderValue);
    if (!projectName.trim() || !projectNo.trim() || !value) {
      setError("Fill name, project no., and order value.");
      return;
    }
    const dlp = acceptedDlpMonths(dlpMonths);
    if (dlp == null) {
      setError(DLP_MONTHS_RANGE_MESSAGE);
      return;
    }
    updateContract(id, {
      projectName: projectName.trim(),
      projectNo: projectNo.trim(),
      orderNos: orderNos.trim(),
      orderDate,
      closureDate,
      orderValue: value,
      city: city.trim(),
      state: state.trim(),
      country: country.trim(),
      paymentDueDays: Number(paymentDueDays) || 30,
      retentionPercent: Number(retentionPercent) || 0,
      tdsPercent: Number(tdsPercent) || 0,
      dlpMonths: dlp,
      contractorAssigned: contractorAssigned.trim(),
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
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-[var(--fh-line)] bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" value={projectName} onChange={setProjectName} />
          <Field label="Project no." value={projectNo} onChange={setProjectNo} />
          <Field label="Order no(s)" value={orderNos} onChange={setOrderNos} />
          <div className="space-y-2">
            <Label>Order date</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Closure date</Label>
            <Input type="date" value={closureDate} onChange={(e) => setClosureDate(e.target.value)} />
          </div>
          <Field label="Order value" value={orderValue} onChange={setOrderValue} type="number" />
          <Field label="City" value={city} onChange={setCity} />
          <Field label="State" value={state} onChange={setState} />
          <Field label="Country" value={country} onChange={setCountry} />
          <Field label="Payment due days" value={paymentDueDays} onChange={setPaymentDueDays} type="number" />
          <Field label="Retention %" value={retentionPercent} onChange={setRetentionPercent} type="number" />
          <Field label="TDS % of net" value={tdsPercent} onChange={setTdsPercent} type="number" />
          <Field label="DLP months" value={dlpMonths} onChange={setDlpMonths} type="number" />
          <Field label="Contractor assigned" value={contractorAssigned} onChange={setContractorAssigned} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" className="bg-[var(--fh-steel)]">
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
