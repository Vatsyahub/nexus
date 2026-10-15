import { formatMoney } from "@/lib/format-money";

/** Money + optional reason for other deductions on payment views and reports. */
export function formatOtherDeductions(
  amount: number,
  reason?: string | null
): string {
  const trimmed = (reason ?? "").trim();
  if (!amount && !trimmed) return formatMoney(0);
  if (!trimmed) return formatMoney(amount);
  if (!amount) return trimmed;
  return `${formatMoney(amount)} — ${trimmed}`;
}

/** Compact list suffix after "other", e.g. "₹500.00 — freight". */
export function formatOtherDeductionsSuffix(
  amount: number,
  reason?: string | null
): string {
  const trimmed = (reason ?? "").trim();
  if (!amount) return "";
  if (!trimmed) return formatMoney(amount);
  return `${formatMoney(amount)} — ${trimmed}`;
}
