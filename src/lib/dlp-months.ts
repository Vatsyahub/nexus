/** Whole months accepted when creating or editing a contract. */
export const DLP_MONTHS_MIN = 3;
export const DLP_MONTHS_MAX = 60;

export const DLP_MONTHS_RANGE_MESSAGE =
  "DLP must be whole months from 3 to 60.";

/**
 * A whole number of months from 3 to 60 inclusive.
 * Anything else is refused. Stored contracts are not rewritten here.
 */
export function acceptedDlpMonths(value: string | number): number | null {
  const months = typeof value === "number" ? value : Number(value);
  if (
    !Number.isInteger(months) ||
    months < DLP_MONTHS_MIN ||
    months > DLP_MONTHS_MAX
  ) {
    return null;
  }
  return months;
}
