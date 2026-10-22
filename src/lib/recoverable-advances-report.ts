/**
 * Other reports → Recoverable advances.
 * Figures come from the same pool line the payment form shows.
 */

import type { FlowhubData } from "@/lib/types";
import { recoverableRunningLineFigures } from "@/lib/store";

export const RECOVERABLE_ADVANCES_HEADERS = [
  "Project",
  "ADVANCE",
  "RECOVERED",
  "LEFT TO RECOVER",
] as const;

export type RecoverableAdvanceRow = {
  contractId: string;
  projectNo: string;
  projectName: string;
  /** Net + GST on this contract's recoverable payments. */
  advance: number;
  /** Sum of `recovered` on this contract's tax-invoice payments. */
  recovered: number;
  /** Advance minus recovered. Kept when it is 0. */
  left: number;
};

/**
 * One row per contract that has at least one recoverable payment.
 * Billing-term Advance percent is not this column.
 */
export function buildRecoverableAdvanceRows(
  data: FlowhubData
): RecoverableAdvanceRow[] {
  return data.contracts
    .filter((c) =>
      data.payments.some(
        (p) => p.contractId === c.id && p.link === "recoverable"
      )
    )
    .map((c) => {
      const figures = recoverableRunningLineFigures(data.payments, c.id);
      return {
        contractId: c.id,
        projectNo: c.projectNo,
        projectName: c.projectName,
        advance: figures.pool,
        recovered: figures.recovered,
        left: figures.left,
      };
    })
    .sort((a, b) => a.projectNo.localeCompare(b.projectNo));
}

export function sumRecoverableAdvances(
  rows: readonly RecoverableAdvanceRow[]
): { advance: number; recovered: number; left: number } {
  return rows.reduce(
    (t, r) => ({
      advance: t.advance + r.advance,
      recovered: t.recovered + r.recovered,
      left: t.left + r.left,
    }),
    { advance: 0, recovered: 0, left: 0 }
  );
}

/** Name over project no., the same identity the on-screen cell stacks. */
export function recoverableAdvanceProjectCell(row: {
  projectName: string;
  projectNo: string;
}): string {
  return `${row.projectName}\n${row.projectNo}`;
}

export function recoverableAdvanceExportRows(
  rows: readonly RecoverableAdvanceRow[]
): (string | number)[][] {
  const body = rows.map((r) => [
    recoverableAdvanceProjectCell(r),
    r.advance,
    r.recovered,
    r.left,
  ]);
  if (rows.length === 0) return body;
  const totals = sumRecoverableAdvances(rows);
  return [
    ...body,
    ["Total", totals.advance, totals.recovered, totals.left],
  ];
}
