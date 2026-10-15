import { formatMoney } from "@/lib/format-money";

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
