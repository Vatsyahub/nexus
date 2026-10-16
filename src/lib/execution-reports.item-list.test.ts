import assert from "node:assert/strict";
import test from "node:test";
import type {
  BoqItem,
  Contract,
  DeliveryChallan,
  FlowhubData,
  ScheduleLine,
} from "@/lib/types";
import {
  buildItemListRows,
  formatItemListCityCell,
  itemListCities,
  itemListExportRow,
  itemListHeaders,
} from "@/lib/execution-reports";

function line(
  id: string,
  name: string,
  quantity: number,
  unit = "Nos"
): BoqItem {
  return {
    id,
    catalogKey: name.trim().toLowerCase(),
    name,
    unit,
    rate: 1,
    quantity,
  };
}

function contract(opts: {
  id: string;
  city?: string | null;
  status?: Contract["status"];
  boq?: BoqItem[];
}): Contract {
  return {
    id: opts.id,
    city: opts.city ?? "",
    status: opts.status ?? "active",
    boq: opts.boq ?? [],
  } as Contract;
}

function challan(
  id: string,
  contractId: string,
  lines: { boqItemId: string; qty: number }[]
): DeliveryChallan {
  return {
    id,
    contractId,
    dcNo: id,
    date: "2026-10-01",
    lines,
    createdAt: "2026-10-01T00:00:00.000Z",
    createdBy: null,
  };
}

function workspace(opts: {
  contracts: Contract[];
  deliveryChallans?: DeliveryChallan[];
  schedules?: ScheduleLine[];
}): FlowhubData {
  return {
    contracts: opts.contracts,
    deliveryChallans: opts.deliveryChallans ?? [],
    schedules: opts.schedules ?? [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    scheduleChangeLog: [],
    notifications: [],
    customDepartments: [],
    expenseCategories: [],
    installationProgress: [],
  };
}

test("a city cell is left for supply, and a missing city stays blank", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "mum",
        city: " Mumbai ",
        boq: [
          line("m-panel", " panel ", 10, "Nos"),
          line("m-cable", "Cable", 4, "m"),
          line("m-blank", "   ", 99),
        ],
      }),
      contract({
        id: "mum-2",
        city: "Mumbai",
        boq: [line("m2-panel", "Panel", 2.5, "Set")],
      }),
      contract({
        id: "del",
        city: "Delhi",
        boq: [line("d-panel", "Panel", 8)],
      }),
      contract({
        id: "blank",
        city: "   ",
        boq: [line("b-panel", "Panel", 7)],
      }),
      contract({
        id: "zero",
        city: "Pune",
        boq: [line("p-cable", "Cable", 5)],
      }),
      contract({
        id: "hold",
        city: "Jaipur",
        status: "on_hold",
        boq: [line("j-panel", "Panel", 100)],
      }),
      contract({
        id: "done",
        city: "Chennai",
        status: "complete",
        boq: [line("c-panel", "Panel", 50)],
      }),
      contract({
        id: "empty-boq",
        city: "Ahmedabad",
        boq: [],
      }),
    ],
    deliveryChallans: [
      challan("dc-m1", "mum", [
        { boqItemId: "m-panel", qty: 4 },
        { boqItemId: "m-panel", qty: 1 },
        { boqItemId: "m-cable", qty: 6 },
        { boqItemId: "not-on-boq", qty: 9 },
      ]),
      challan("dc-m2", "mum-2", [{ boqItemId: "m2-panel", qty: 1 }]),
      challan("dc-del", "del", [{ boqItemId: "d-panel", qty: 8 }]),
      challan("dc-blank", "blank", [{ boqItemId: "b-panel", qty: 2 }]),
      challan("dc-hold", "hold", [{ boqItemId: "j-panel", qty: 40 }]),
      challan("dc-done", "done", [{ boqItemId: "c-panel", qty: 20 }]),
    ],
  });

  assert.deepEqual(itemListCities(data), [
    "Ahmedabad",
    "Delhi",
    "Mumbai",
    "Pune",
  ]);

  const rows = buildItemListRows(data);
  const panel = rows.find((r) => r.key === "panel");
  const cable = rows.find((r) => r.key === "cable");
  assert.ok(panel);
  assert.ok(cable);
  assert.equal(panel.itemName, "panel");
  assert.deepEqual(
    rows.map((r) => r.itemName),
    ["Cable", "panel"]
  );

  assert.equal(panel.totalQty, 10 + 2.5 + 8 + 7);
  assert.equal(panel.totalSupplied, 4 + 1 + 1 + 8 + 2);
  assert.equal(panel.leftForSupply, panel.totalQty - panel.totalSupplied);
  assert.deepEqual(panel.byCity.Mumbai, { boqQty: 12.5, leftForSupply: 6.5 });
  assert.deepEqual(panel.byCity.Delhi, { boqQty: 8, leftForSupply: 0 });
  assert.equal(panel.byCity.Pune, undefined);
  assert.equal(panel.byCity.Ahmedabad, undefined);
  assert.equal("Jaipur" in panel.byCity, false);
  assert.equal("Chennai" in panel.byCity, false);

  assert.deepEqual(cable.byCity.Mumbai, { boqQty: 4, leftForSupply: -2 });
  assert.deepEqual(cable.byCity.Pune, { boqQty: 5, leftForSupply: 5 });
  assert.equal(cable.totalQty, 9);
  assert.equal(cable.totalSupplied, 6);
  assert.equal(cable.leftForSupply, 3);

  const cities = itemListCities(data);
  assert.deepEqual(itemListHeaders(cities), [
    "Item name",
    "Total supplied",
    "Left for supply",
    "Ahmedabad",
    "Delhi",
    "Mumbai",
    "Pune",
  ]);
  assert.deepEqual(itemListExportRow(cities, panel), [
    "panel",
    16,
    11.5,
    "",
    0,
    6.5,
    "",
  ]);
  assert.equal(formatItemListCityCell(cable.byCity.Mumbai), -2);
  assert.equal(formatItemListCityCell(undefined), "");
  assert.equal(formatItemListCityCell({ boqQty: 0, leftForSupply: 0 }), 0);
});

test("a handed-over contract stays out of the item list", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "live",
        city: "Delhi",
        boq: [line("live-item", "Switch", 3)],
      }),
      contract({
        id: "handed",
        city: "Delhi",
        status: "active",
        boq: [line("handed-item", "Switch", 20)],
      }),
    ],
    deliveryChallans: [
      challan("dc-handed", "handed", [{ boqItemId: "handed-item", qty: 9 }]),
    ],
    schedules: [
      {
        id: "ho",
        contractId: "handed",
        kind: "handover",
        done: true,
      } as ScheduleLine,
    ],
  });

  const [row] = buildItemListRows(data);
  assert.equal(row.itemName, "Switch");
  assert.equal(row.totalQty, 3);
  assert.equal(row.totalSupplied, 0);
  assert.equal(row.leftForSupply, 3);
  assert.deepEqual(row.byCity.Delhi, { boqQty: 3, leftForSupply: 3 });
});

test("a city that has the item keeps zero and negative left", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "goa",
        city: "Goa",
        boq: [line("zero-qty", "Blank qty", Number.NaN), line("over", "Over", 1)],
      }),
    ],
    deliveryChallans: [
      challan("dc-over", "goa", [{ boqItemId: "over", qty: 4 }]),
    ],
  });
  const rows = buildItemListRows(data);
  const blank = rows.find((r) => r.key === "blank qty");
  const over = rows.find((r) => r.key === "over");
  assert.ok(blank);
  assert.ok(over);
  assert.deepEqual(blank.byCity.Goa, { boqQty: 0, leftForSupply: 0 });
  assert.deepEqual(over.byCity.Goa, { boqQty: 1, leftForSupply: -3 });
  assert.deepEqual(itemListExportRow(["Goa"], over), [
    "Over",
    4,
    -3,
    -3,
  ]);
  assert.equal(formatItemListCityCell(blank.byCity.Goa), 0);
});
