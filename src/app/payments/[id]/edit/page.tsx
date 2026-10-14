"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { updatePayment, useFlowhubData } from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  PaymentForm,
  type PaymentFormValues,
} from "@/components/payment-form";
import { buttonVariants } from "@/components/ui/button";
import { formatDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export default function EditPaymentPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const data = useFlowhubData();
  const payment = data.payments.find((p) => p.id === id);

  if (!payment) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--fh-muted)]">Payment not found.</p>
        <Link href="/payments" className={cn(buttonVariants({ variant: "outline" }))}>
          Back
        </Link>
      </div>
    );
  }

  async function onSubmit(values: PaymentFormValues) {
    const updated = updatePayment(id, values);
    if (!updated) return "Could not save payment.";
    const saved = await confirmWorkspaceSave();
    if (!saved) return null;
    router.push(`/payments/${id}`);
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
            Edit payment
          </h1>
          <p className="mt-1 text-sm text-[var(--fh-muted)]">
            {formatDisplayDate(payment.date)}
          </p>
        </div>
        <Link
          href={`/payments/${id}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Cancel
        </Link>
      </div>
      <PaymentForm
        initial={payment}
        submitLabel="Save changes"
        onSubmit={onSubmit}
      />
    </div>
  );
}
