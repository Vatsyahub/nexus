import { formatMoney } from "@/lib/format-money";
import type { PaymentLink } from "@/lib/types";

/** Link choice shown on the payment form and payment pages. */
export function paymentLinkLabel(link: PaymentLink | undefined): string {
  if (link === "PI") return "Proforma";
  if (link === "recoverable") return "Recoverable";
  if (link === "unlinked") return "Unlinked";
  return "Tax invoice";
}

/**
 * Pool line under Recovered, and on an open recoverable payment.
 * Words stay Recovered / of / left; amounts use the shared rupee format.
 */
export function formatRecoverableRunningLine(
  recovered: number,
  pool: number
): string {
  const left = pool - recovered;
  return `Recovered ${formatMoney(recovered)} of ${formatMoney(pool)}, ${formatMoney(left)} left`;
}

/** Other deductions row on payment detail: amount with optional reason. */
export function formatOtherDeductions(
  amount: number,
  reason?: string | null
): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) return formatMoney(amount);
  if (!amount) return trimmed;
  return `${formatMoney(amount)} — ${trimmed}`;
}
