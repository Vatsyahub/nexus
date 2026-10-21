import assert from "node:assert/strict";
import test from "node:test";
import {
  billingCityBars,
  billingScaleMax,
  buildCoreReportRows,
  buildOutstandingOverview,
  buildCostCentreRows,
  contractCostAmount,
  normalizeNexusCosts,
  piePercents,
  profitPercentOf,
  wholeRupees,
  yetToBillAmount,
  yetToCollectAmount,
} from "@/lib/nexus-core";
import {
  EMPTY_NEXUS_COSTS,
  type Contract,
  type ContractExpense,
  type FlowhubData,
  type Invoice,
  type Payment,
} from "@/lib/types";

function contract(partial: Partial<Contract> = {}): Contract {
  return {
    id: "c1",
    projectName: "Alpha",
    projectNo: "P-1",
    orderNos: "WO-1",
    orderDate: "2026-01-01",
    closureDate: "2026-12-31",
    orderValue: 100000,
    gstApplicable: true,
    city: "Chennai",
    state: "Tamil Nadu",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    abgNumber: null,
    abgDate: null,
    abgExpiry: null,
    abgBankName: null,
    abgRetrieved: false,
    abgRetrievedDate: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    pbgNumber: null,
    pbgDate: null,
    pbgExpiry: null,
    pbgBankName: null,
    pbgRetrieved: false,
    pbgRetrievedDate: null,
    retentionRecoveredAt: null,
    contractorAssigned: "",
    handoverDate: null,
    boq: [],
    amendments: [],
    expenses: [],
    guaranteeEdits: [],
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function expense(amount: number): ContractExpense {
  return {
    id: "e1",
    amount,
    date: "2026-02-01",
    personPaid: "Ada",
    reason: "Travel",
    category: "Travel",
    createdAt: "2026-02-01T00:00:00.000Z",
    createdBy: "Ada",
    editHistory: [],
    deletedAt: null,
    deletedBy: null,
  };
}

function hub(partial: Partial<FlowhubData> = {}): FlowhubData {
  return {
    contracts: [],
    tasks: [],
    itemCatalog: [],
    invoices: [],
    payments: [],
    schedules: [],
    scheduleChangeLog: [],
    taskDeadlineChangeLog: [],
    notifications: [],
    customDepartments: [],
    expenseCategories: [],
    deliveryChallans: [],
    installationProgress: [],
    nexusCosts: EMPTY_NEXUS_COSTS,
    ...partial,
  };
}

test("a saved direct cost becomes Yet to spend and BOQ rates are dropped", () => {
  const costs = normalizeNexusCosts({
    columns: [{ id: "labour", header: "Labour" }],
    contracts: {
      c1: {
        directCost: 180000,
        lineRates: { panel: { labour: 999 } },
      },
      empty: { directCost: null, lineRates: { panel: { labour: 50 } } },
    },
  });
  assert.deepEqual(costs.contracts.c1, { spent: null, yetToSpend: 180000 });
  assert.equal(costs.contracts.empty, undefined);
  assert.equal("columns" in costs, false);
});

test("spent and yet to spend already saved stay, and a typed zero is kept", () => {
  const costs = normalizeNexusCosts({
    contracts: {
      c1: { spent: 20, yetToSpend: 0, directCost: 999 },
    },
  });
  assert.deepEqual(costs.contracts.c1, { spent: 20, yetToSpend: 0 });
});

test("contract cost is spent plus yet to spend", () => {
  const costs = normalizeNexusCosts({
    contracts: { c1: { spent: 40, yetToSpend: 60 } },
  });
  assert.equal(contractCostAmount(contract(), costs), 100);
});

test("cost centre cumulative is contract cost plus expenses, not retention", () => {
  const row = buildCostCentreRows(
    hub({
      contracts: [
        contract({
          orderValue: 500000,
          retentionPercent: 10,
          expenses: [expense(60700)],
        }),
      ],
      nexusCosts: {
        contracts: { c1: { spent: 180000, yetToSpend: 220000 } },
      },
    }),
    "2026-10-21"
  )[0];
  assert.ok(row);
  assert.equal(row.spent, 180000);
  assert.equal(row.yetToSpend, 220000);
  assert.equal(row.contractCost, 400000);
  assert.equal(row.cumulative, 460700);
  assert.equal(row.comparison, 500000);
  assert.equal(row.profit, 39300);
  assert.equal(row.profitPercent, profitPercentOf(39300, 500000));
  assert.equal("fromBoq" in row, false);
});

test("yet to bill is the work-order value minus tax invoices", () => {
  assert.equal(yetToBillAmount(100000, 40000), 60000);
});

test("yet to collect takes retention, TDS, and payment net, GST, and other deductions", () => {
  const deal = contract({
    orderValue: 100000,
    retentionPercent: 5,
    tdsPercent: 2,
    gstApplicable: true,
  });
  const payments = [
    {
      netAmount: 10000,
      gstAmount: 1800,
      otherDeductions: 500,
      retentionAmount: 999,
      tdsAmount: 999,
    },
  ] as unknown as Pick<Payment, "netAmount" | "gstAmount" | "otherDeductions">[];
  assert.equal(yetToCollectAmount(deal, payments), 80700);
  assert.equal(
    yetToCollectAmount({ ...deal, gstApplicable: false }, payments),
    82500
  );
});

test("core report profit matches the project card and rows follow project number", () => {
  const data = hub({
    contracts: [
      contract({
        id: "b",
        projectNo: "P-2",
        projectName: "Beta",
        city: "Pune",
        orderValue: 80000,
      }),
      contract({ id: "a", projectNo: "P-1", city: "Chennai" }),
    ],
    invoices: [
      {
        id: "ti",
        type: "TI",
        contractId: "a",
        netAmount: 25000,
      } as Invoice,
    ],
    payments: [
      {
        id: "pay",
        contractId: "a",
        netAmount: 10000,
        gstAmount: 1800,
        otherDeductions: 500,
        retentionAmount: 999,
        tdsAmount: 999,
      } as Payment,
    ],
    nexusCosts: {
      contracts: {
        a: { spent: 180000, yetToSpend: 220000 },
        b: { spent: null, yetToSpend: 50000 },
      },
    },
  });
  const today = "2026-10-21";
  const report = buildCoreReportRows(data, today);
  const cards = buildCostCentreRows(data, today);
  assert.deepEqual(
    report.map((row) => row.projectNo),
    ["P-1", "P-2"]
  );
  assert.equal(report[0]?.yetToBill, 75000);
  assert.equal(report[0]?.yetToCollect, yetToCollectAmount(data.contracts[1], data.payments));
  assert.equal(report[0]?.profit, cards.find((row) => row.contractId === "a")?.profit);
  assert.equal(report[1]?.spent, 0);
  assert.equal(report[1]?.yetToSpend, 50000);
  assert.equal(report[1]?.city, "Pune");
});

test("outstanding windows include both ends and the total includes overdue", () => {
  const overview = buildOutstandingOverview([
    { daysUntilDue: 0, outstanding: 100 },
    { daysUntilDue: 7, outstanding: 200 },
    { daysUntilDue: 8, outstanding: 300 },
    { daysUntilDue: 15, outstanding: 400 },
    { daysUntilDue: 16, outstanding: 500 },
    { daysUntilDue: 23, outstanding: 600 },
    { daysUntilDue: 24, outstanding: 700 },
    { daysUntilDue: -1, outstanding: 800 },
  ]);
  assert.deepEqual(
    overview.bars.map((bar) => [bar.label, bar.amount, bar.count]),
    [
      ["0–7 days", 300, 2],
      ["8–15 days", 700, 2],
      ["16–23 days", 1100, 2],
      ["24+ days", 700, 1],
      ["Overdue", 800, 1],
    ]
  );
  assert.equal(overview.total, 3600);
  const empty = buildOutstandingOverview([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.bars.length, 5);
  assert.ok(empty.bars.every((bar) => bar.amount === 0 && bar.count === 0));
});

test("pie percents add to 100 and the billing scale is the largest work order", () => {
  const parts = piePercents([1, 2]);
  assert.equal(parts[0]! + parts[1]!, 100);
  assert.deepEqual(piePercents([40, 60]), [40, 60]);
  assert.deepEqual(piePercents([0, 10]), [0, 100]);
  const bars = billingCityBars(
    [
      contract({ id: "a", city: "Pune", orderValue: 150000 }),
      contract({ id: "b", city: "Jamshedpur", orderValue: 800000 }),
    ],
    hub(),
    ""
  );
  assert.equal(billingScaleMax(bars.map((bar) => bar.wo)), 800000);
  const one = billingCityBars(
    [
      contract({ id: "a", city: "Pune", orderValue: 150000 }),
      contract({ id: "b", city: "Jamshedpur", orderValue: 800000 }),
    ],
    hub(),
    "Pune"
  );
  assert.equal(billingScaleMax(one.map((bar) => bar.wo)), 150000);
  assert.equal(wholeRupees(10.6), 11);
});
