"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addPayment } from "@/lib/store";
import { confirmWorkspaceSave } from "@/lib/save-notice";
import {
  PaymentForm,
  type PaymentFormValues,
} from "@/components/payment-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NewPaymentClient({
  defaultContractId,
}: {
  defaultContractId: string;
}) {
  const router = useRouter();

  async function onCreate(values: PaymentFormValues) {
    const pay = addPayment(values);
    if (!pay) return "Could not save payment.";
    const saved = await confirmWorkspaceSave();
    if (!saved) return null;
    router.push("/payments");
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--fh-steel)]">
          Add payment
        </h1>
        <Link
          href="/payments"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back to payments
        </Link>
      </div>
      <PaymentForm
        defaultContractId={defaultContractId}
        cancelHref="/payments"
        submitLabel="Save payment"
        onSubmit={onCreate}
      />
    </div>
  );
}
