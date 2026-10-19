import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoqAmendment,
  BoqAmendmentLineDiff,
  BoqItem,
  Contract,
} from "@/lib/types";
import {
  AMENDMENT_LIST_HEADERS,
  amendmentCellTone,
  amendmentLineColour,
  buildAmendmentLineRows,
  buildAmendmentListRows,
  buildAmendmentVersions,
  filterAmendmentListRows,
} from "@/lib/amendments-report";

function line(
  id: string,
  name: string,
  rate: number,
  quantity: number
): BoqItem {
  return {
    id,
    catalogKey: name.toLowerCase(),
    name,
    unit: "Nos",
    rate,
    quantity,
  };
}

function diff(
  item: BoqItem,
  kind: BoqAmendmentLineDiff["kind"],
  previousQty: number | null,
  newQty: number | null
): BoqAmendmentLineDiff {
  return {
    boqItemId: item.id,
    name: item.name,
    unit: item.unit,
    rate: item.rate,
    kind,
    previousQty,
    newQty,
  };
}

function amendment(
  partial: Pick<BoqAmendment, "id" | "seq" | "number" | "date" | "previousOrderValue" | "newOrderValue" | "lineDiffs" | "boqSnapshot">
): BoqAmendment {
  return {
    at: partial.date,
    by: "Master",
    note: "",
    previousBoqTotal: partial.previousOrderValue,
    newBoqTotal: partial.newOrderValue,
    ...partial,
  };
}

function contract(
  partial: Pick<Contract, "id" | "projectName" | "projectNo" | "city" | "orderDate" | "orderValue" | "boq" | "amendments">
): Contract {
  return partial as Contract;
}

test("amendment list columns use the original value, the count, and the latest amendment", () => {
  assert.deepEqual(AMENDMENT_LIST_HEADERS, [
    "Project name and no.",
    "City",
    "Order date",
    "Original work order value",
    "Amendments",
    "Final amendment value",
    "Final amendment date",
  ]);

  const itemA = line("a", "Item A", 100, 10);
  const itemA2 = line("a2", "Item A", 1000, 10);
  const tower = contract({
    id: "tower",
    projectName: "Tower",
    projectNo: "P-2",
    city: "Mumbai",
    orderDate: "2026-01-15",
    orderValue: 2500,
    boq: [itemA2],
    amendments: [
      amendment({
        id: "a1",
        seq: 1,
        number: "A1",
        date: "2026-02-01",
        previousOrderValue: 1000,
        newOrderValue: 1800,
        lineDiffs: [diff(itemA, "qty_changed", 10, 12)],
        boqSnapshot: [{ ...itemA, quantity: 12 }],
      }),
      amendment({
        id: "a2",
        seq: 2,
        number: "A2",
        date: "2026-03-01",
        previousOrderValue: 1800,
        newOrderValue: 2500,
        lineDiffs: [
          diff(itemA, "removed", 12, null),
          diff(itemA2, "added", null, 10),
        ],
        boqSnapshot: [itemA2],
      }),
    ],
  });
  const plain = contract({
    id: "plain",
    projectName: "Plain",
    projectNo: "P-9",
    city: "Delhi",
    orderDate: "2026-01-01",
    orderValue: 500,
    boq: [line("p", "Plain item", 50, 10)],
    amendments: [],
  });
  const yard = contract({
    id: "yard",
    projectName: "Yard",
    projectNo: "P-1",
    city: "Pune",
    orderDate: "2026-04-01",
    orderValue: 400,
    boq: [line("y", "Yard item", 40, 10)],
    amendments: [
      amendment({
        id: "y1",
        seq: 1,
        number: "A1",
        date: "2026-04-20",
        previousOrderValue: 300,
        newOrderValue: 400,
        lineDiffs: [diff(line("y", "Yard item", 40, 8), "qty_changed", 8, 10)],
        boqSnapshot: [line("y", "Yard item", 40, 10)],
      }),
    ],
  });

  const rows = buildAmendmentListRows([tower, plain, yard]);
  assert.deepEqual(
    rows.map((row) => row.projectNo),
    ["P-1", "P-2"]
  );
  const listed = rows[1];
  assert.ok(listed);
  assert.equal(listed.projectName, "Tower");
  assert.equal(listed.projectNo, "P-2");
  assert.equal(listed.city, "Mumbai");
  assert.equal(listed.orderDate, "2026-01-15");
  assert.equal(listed.originalWorkOrderValue, 1000);
  assert.equal(listed.amendmentCount, 2);
  assert.equal(listed.finalAmendmentValue, 2500);
  assert.equal(listed.finalAmendmentDate, "2026-03-01");
  assert.equal(rows[0]?.originalWorkOrderValue, 300);
  assert.equal(rows[0]?.finalAmendmentValue, 400);
  assert.equal(rows[0]?.finalAmendmentDate, "2026-04-20");

  assert.deepEqual(
    filterAmendmentListRows(rows, "Tower").map((row) => row.projectNo),
    ["P-2"]
  );
  assert.deepEqual(
    filterAmendmentListRows(rows, "Pune").map((row) => row.projectNo),
    ["P-1"]
  );
  assert.deepEqual(
    filterAmendmentListRows(rows, "Tower, Mumbai").map((row) => row.projectNo),
    ["P-2"]
  );
  assert.deepEqual(filterAmendmentListRows(rows, "Tower, Pune"), []);
});

test("a same-name rate change is a yellow line and only the rate is highlighted", () => {
  const itemA = line("a", "Item A", 100, 10);
  const itemANew = line("a-new", "Item A", 1000, 10);
  const itemB = line("b", "Item B", 200, 10);
  const itemBNext = line("b", "Item B", 200, 20);
  const itemC = line("c", "Item C", 300, 10);
  const itemD = line("d", "Item D", 400, 10);
  const itemG = line("g", "Item G", 50, 5);
  const itemGNew = line("g-new", "Item G", 80, 7);
  const itemF = line("f", "Item F", 90, 3);
  const snapshot = [itemANew, itemBNext, itemD, itemGNew, itemF];
  const rated = contract({
    id: "rated",
    projectName: "Rated",
    projectNo: "P-R",
    city: "Delhi",
    orderDate: "2026-01-01",
    orderValue: 1,
    boq: snapshot,
    amendments: [
      amendment({
        id: "amd",
        seq: 1,
        number: "A1",
        date: "2026-02-01",
        previousOrderValue: 1,
        newOrderValue: 2,
        boqSnapshot: snapshot,
        lineDiffs: [
          diff(itemA, "removed", 10, null),
          diff(itemANew, "added", null, 10),
          diff(itemB, "qty_changed", 10, 20),
          diff(itemC, "removed", 10, null),
          diff(itemG, "removed", 5, null),
          diff(itemGNew, "added", null, 7),
          diff(itemF, "added", null, 3),
        ],
      }),
    ],
  });

  const versions = buildAmendmentVersions(rated);
  const lines = buildAmendmentLineRows(versions);
  const toneFor = (name: string) => {
    const row = lines.find((entry) => entry.name === name);
    assert.ok(row, name);
    return amendmentCellTone(row, 1);
  };

  const rateOnly = toneFor("Item A");
  assert.equal(lines.filter((entry) => entry.name === "Item A").length, 1);
  assert.equal(rateOnly.line, "changed");
  assert.equal(amendmentLineColour(rateOnly), "yellow");
  assert.deepEqual(rateOnly.highlight, ["rate"]);

  const qtyOnly = toneFor("Item B");
  assert.equal(amendmentLineColour(qtyOnly), "yellow");
  assert.deepEqual(qtyOnly.highlight, ["quantity"]);

  const both = toneFor("Item G");
  assert.equal(amendmentLineColour(both), "yellow");
  assert.deepEqual(both.highlight, ["quantity", "rate"]);

  const added = toneFor("Item F");
  assert.equal(amendmentLineColour(added), "green");
  assert.deepEqual(added.highlight, ["quantity", "rate"]);

  const removed = toneFor("Item C");
  assert.equal(amendmentLineColour(removed), "removal");
  assert.deepEqual(removed.highlight, []);

  const same = toneFor("Item D");
  assert.equal(amendmentLineColour(same), "unchanged");
  assert.deepEqual(same.highlight, []);
});
