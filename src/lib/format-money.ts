/** INR display helper shared by money screens and reports. */
export function formatMoney(n: number, fractionDigits = 2) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: fractionDigits,
  }).format(n);
}
