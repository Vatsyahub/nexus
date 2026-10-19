import { matchesAny } from "@/lib/list-search";
import { itemNameKey } from "@/lib/item-rename";
import type { BoqAmendment, BoqItem, Contract } from "@/lib/types";

export const AMENDMENT_LIST_HEADERS = [
  "Project name and no.",
  "City",
  "Order date",
  "Original work order value",
  "Amendments",
  "Final amendment value",
  "Final amendment date",
] as const;

export type AmendmentListRow = {
  contractId: string;
  projectName: string;
  projectNo: string;
  city: string;
  orderDate: string;
  /** Order value before any amendment. */
  originalWorkOrderValue: number;
  amendmentCount: number;
  /** Order value after the latest amendment. */
  finalAmendmentValue: number;
  /** Date of the latest amendment. */
  finalAmendmentDate: string;
};

function orderedAmendments(contract: Contract): BoqAmendment[] {
  return [...(contract.amendments ?? [])].sort(
    (a, b) => (a.seq || 0) - (b.seq || 0) || a.date.localeCompare(b.date)
  );
}

/** Contracts that have at least one amendment, oldest amendment first inside each row. */
export function buildAmendmentListRows(
  contracts: readonly Contract[]
): AmendmentListRow[] {
  const rows: AmendmentListRow[] = [];
  for (const contract of contracts) {
    const amendments = orderedAmendments(contract);
    const first = amendments[0];
    const latest = amendments[amendments.length - 1];
    if (!first || !latest) continue;
    rows.push({
      contractId: contract.id,
      projectName: contract.projectName,
      projectNo: contract.projectNo,
      city: (contract.city || "").trim(),
      orderDate: contract.orderDate,
      originalWorkOrderValue: first.previousOrderValue,
      amendmentCount: amendments.length,
      finalAmendmentValue: latest.newOrderValue,
      finalAmendmentDate: latest.date,
    });
  }
  rows.sort(
    (a, b) =>
      a.projectNo.localeCompare(b.projectNo) ||
      a.projectName.localeCompare(b.projectName)
  );
  return rows;
}

/**
 * Narrow by project name, project no., or city.
 * Two chips must both match, so a name and a city can be used together.
 */
export function filterAmendmentListRows(
  rows: readonly AmendmentListRow[],
  query: string
): AmendmentListRow[] {
  const needle = query.trim();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    matchesAny(needle, [row.projectName, row.projectNo, row.city])
  );
}

export type AmendmentVersion = {
  key: string;
  kind: "wo" | "amendment";
  label: string;
  date: string;
  value: number;
  boq: BoqItem[];
};

/**
 * BOQ as on the original work order. The contract only keeps the latest BOQ,
 * so undo the first amendment's line diffs against its snapshot.
 */
function originalBoq(contract: Contract, first: BoqAmendment): BoqItem[] {
  const base = first.boqSnapshot.length ? first.boqSnapshot : contract.boq;
  const diffs = new Map(first.lineDiffs.map((d) => [d.boqItemId, d]));
  const out: BoqItem[] = [];
  for (const line of base) {
    const d = diffs.get(line.id);
    if (d?.kind === "added") continue;
    if (d?.kind === "qty_changed" && d.previousQty != null) {
      out.push({ ...line, quantity: d.previousQty });
    } else {
      out.push(line);
    }
  }
  for (const d of first.lineDiffs) {
    if (d.kind !== "removed") continue;
    out.push({
      id: d.boqItemId,
      catalogKey: "",
      name: d.name,
      unit: d.unit,
      rate: d.rate,
      quantity: d.previousQty ?? 0,
    });
  }
  return out;
}

export function buildAmendmentVersions(contract: Contract): AmendmentVersion[] {
  const amendments = orderedAmendments(contract);
  const wo: AmendmentVersion = {
    key: "wo",
    kind: "wo",
    label: "Work order",
    date: contract.orderDate,
    value: amendments.length ? amendments[0].previousOrderValue : contract.orderValue,
    boq: amendments[0] ? originalBoq(contract, amendments[0]) : contract.boq,
  };
  return [
    wo,
    ...amendments.map((a, i) => ({
      key: a.id,
      kind: "amendment" as const,
      label: `Amendment ${a.number}`,
      date: a.date,
      value: a.newOrderValue,
      boq:
        a.boqSnapshot.length || i < amendments.length - 1
          ? a.boqSnapshot
          : contract.boq,
    })),
  ];
}

export type AmendmentLineRow = {
  key: string;
  name: string;
  unit: string;
  cells: (BoqItem | null)[];
};

/**
 * One row per item. A name removed and added back in the next version stays
 * on the same row, so a rate change is not a removal plus a new item.
 */
export function buildAmendmentLineRows(
  versions: readonly AmendmentVersion[]
): AmendmentLineRow[] {
  const rows: AmendmentLineRow[] = [];
  versions.forEach((version, index) => {
    const used = new Set<number>();
    const unmatched: BoqItem[] = [];
    for (const line of version.boq) {
      const byId = rows.findIndex(
        (row, rowIndex) =>
          !used.has(rowIndex) && row.cells.some((cell) => cell?.id === line.id)
      );
      if (byId >= 0) {
        placeLine(rows[byId], index, line);
        used.add(byId);
      } else {
        unmatched.push(line);
      }
    }
    for (const line of unmatched) {
      const nameKey = itemNameKey(line.name);
      const byName = rows.findIndex((row, rowIndex) => {
        if (used.has(rowIndex) || row.cells[index]) return false;
        const previous = index > 0 ? row.cells[index - 1] : null;
        return !!previous && itemNameKey(previous.name) === nameKey;
      });
      if (byName >= 0) {
        placeLine(rows[byName], index, line);
        used.add(byName);
      } else {
        const cells = versions.map(() => null as BoqItem | null);
        cells[index] = line;
        used.add(rows.length);
        rows.push({
          key: line.id,
          name: line.name,
          unit: line.unit,
          cells,
        });
      }
    }
  });
  return rows;
}

function placeLine(row: AmendmentLineRow, index: number, line: BoqItem) {
  row.cells[index] = line;
  row.name = line.name;
  row.unit = line.unit;
}

export type AmendmentFigure = "quantity" | "rate";

export type AmendmentCellTone = {
  line: "same" | "added" | "removed" | "changed" | "absent";
  /** Changed figures only. Other figures on the line stay in the normal colour. */
  highlight: AmendmentFigure[];
};

const QTY_EPS = 1e-9;
const RATE_EPS = 0.005;

export function amendmentCellTone(
  row: AmendmentLineRow,
  index: number
): AmendmentCellTone {
  const current = row.cells[index] ?? null;
  if (index === 0) {
    return { line: current ? "same" : "absent", highlight: [] };
  }
  const previous = row.cells[index - 1] ?? null;
  if (!current && !previous) return { line: "absent", highlight: [] };
  if (!current) return { line: "removed", highlight: [] };
  if (!previous) {
    return { line: "added", highlight: ["quantity", "rate"] };
  }
  const highlight: AmendmentFigure[] = [];
  if (
    Math.abs((Number(current.quantity) || 0) - (Number(previous.quantity) || 0)) >
    QTY_EPS
  ) {
    highlight.push("quantity");
  }
  if (
    Math.abs((Number(current.rate) || 0) - (Number(previous.rate) || 0)) > RATE_EPS
  ) {
    highlight.push("rate");
  }
  if (!highlight.length) return { line: "same", highlight: [] };
  return { line: "changed", highlight };
}

export type AmendmentLineColour = "yellow" | "green" | "removal" | "unchanged";

/** Details-page line colour. Yellow covers a quantity change, a rate change, or both. */
export function amendmentLineColour(
  tone: AmendmentCellTone
): AmendmentLineColour {
  if (tone.line === "changed") return "yellow";
  if (tone.line === "added") return "green";
  if (tone.line === "removed") return "removal";
  return "unchanged";
}
