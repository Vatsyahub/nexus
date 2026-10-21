import assert from "node:assert/strict";
import test from "node:test";
import type {
  Contract,
  ContractExpense,
  DeliveryChallan,
  FlowhubData,
  Invoice,
  Payment,
} from "@/lib/types";
import {
  DC_RECORDS_EXPORT_HEADERS,
  EXECUTION_SUMMARY_EXPORT_HEADERS,
  buildExecutionSummaryRows,
  buildSupplyDetailRows,
  executionSummaryExportRow,
  filterExecutionSummaryRows,
  filterSupplyDetailRows,
  supplyDetailExportRow,
} from "@/lib/execution-reports";
import {
  BANK_GUARANTEE_EXPORT_HEADERS,
  COLLECTION_EXPORT_HEADERS,
  EXPENSE_REPORT_EXPORT_HEADERS,
  RETENTION_EXPORT_HEADERS,
  SALES_INVOICE_EXPORT_HEADERS,
  bankGuaranteeExportRow,
  buildBankGuaranteeRows,
  buildCollectionRows,
  buildExpenseReportRows,
  buildRetentionHeldRows,
  buildSalesInvoiceRows,
  collectionExportRow,
  expenseReportExportRow,
  filterBankGuaranteeRows,
  filterCollectionRows,
  filterExpenseReportRows,
  filterRetentionHeldRows,
  filterSalesInvoiceRows,
  retentionExportRow,
  salesInvoiceExportRow,
} from "@/lib/reports";

const NAGPUR = "Nagpur";
const SURAT = "Surat";

function contract(
  partial: Pick<Contract, "id" | "city"> & Partial<Contract>
): Contract {
  return {
    projectNo: partial.projectNo ?? partial.id,
    projectName: partial.projectName ?? partial.id,
    orderValue: 1000,
    boq: [],
    expenses: [],
    ...partial,
  } as Contract;
}

function invoice(
  partial: Pick<Invoice, "id" | "contractId" | "number" | "date"> &
    Partial<Invoice>
): Invoice {
  return {
    type: "TI",
    lines: [],
    netAmount: 100,
    gstAmount: 18,
    extraCharges: [],
    finalAmount: 118,
    convertedFromPiId: null,
    createdAt: `${partial.date}T00:00:00.000Z`,
    ...partial,
  };
}

function pay(
  partial: Pick<Payment, "id" | "contractId"> & Partial<Payment>
): Payment {
  return {
    invoiceId: null,
    link: "unlinked",
    date: "2026-01-15",
    netAmount: 10,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    createdAt: "2026-01-15T00:00:00.000Z",
    ...partial,
  } as Payment;
}

function expense(
  partial: Pick<ContractExpense, "id" | "date"> & Partial<ContractExpense>
): ContractExpense {
  return {
    amount: 40,
    personPaid: "Asha",
    reason: "site visit",
    category: "Travel",
    createdAt: `${partial.date}T00:00:00.000Z`,
    createdBy: null,
    editHistory: [],
    deletedAt: null,
    deletedBy: null,
    ...partial,
  };
}

function challan(
  partial: Pick<DeliveryChallan, "id" | "contractId" | "dcNo" | "date">
): DeliveryChallan {
  return {
    lines: [{ boqItemId: "panel", qty: 1 }],
    createdAt: `${partial.date}T00:00:00.000Z`,
    createdBy: null,
    ...partial,
  };
}

function workspace(partial: Partial<FlowhubData>): FlowhubData {
  return partial as FlowhubData;
}

function assertNoCityColumn(
  headers: readonly string[],
  rows: (string | number)[][],
  city: string
) {
  assert.equal(
    headers.some((header) => header.trim().toLowerCase() === "city"),
    false
  );
  const needle = city.trim().toLowerCase();
  for (const row of rows) {
    assert.equal(row.length, headers.length);
    assert.equal(
      row.some((cell) => String(cell).trim().toLowerCase() === needle),
      false
    );
  }
}

test("sales invoices keep a city and drop the others, including a missing contract", () => {
  const nagpur = contract({
    id: "c-nag",
    projectNo: "P-N",
    projectName: "North shed",
    city: NAGPUR,
  });
  const surat = contract({
    id: "c-sur",
    projectNo: "P-S",
    projectName: "South shed",
    city: SURAT,
  });
  const blank = contract({
    id: "c-blank",
    projectNo: "P-B",
    projectName: "Plain shed",
    city: "",
  });
  const rows = buildSalesInvoiceRows(
    workspace({
      contracts: [nagpur, surat, blank],
      invoices: [
        invoice({
          id: "jan",
          contractId: nagpur.id,
          number: "104",
          date: "2026-01-15",
        }),
        invoice({
          id: "mar",
          contractId: nagpur.id,
          number: "105",
          date: "2026-03-01",
        }),
        invoice({
          id: "surat",
          contractId: surat.id,
          number: "200",
          date: "2026-01-15",
        }),
        invoice({
          id: "blank",
          contractId: blank.id,
          number: "300",
          date: "2026-01-15",
        }),
        invoice({
          id: "orphan",
          contractId: "missing",
          number: "9",
          date: "2026-01-15",
        }),
        invoice({
          id: "orphan-named",
          contractId: "missing",
          number: "NAGPUR-9",
          date: "2026-01-15",
        }),
      ],
    })
  );

  assert.equal(rows.find((r) => r.invoiceId === "orphan")?.city, "");
  assert.equal(rows.find((r) => r.invoiceId === "jan")?.city, NAGPUR);

  const byCity = filterSalesInvoiceRows(rows, { q: "nagpur" });
  assert.deepEqual(
    byCity.map((r) => r.invoiceId).sort(),
    ["jan", "mar", "orphan-named"]
  );
  assert.equal(
    filterSalesInvoiceRows(rows, { q: "NaGpUr" })
      .map((r) => r.invoiceId)
      .sort()
      .join(),
    byCity
      .map((r) => r.invoiceId)
      .sort()
      .join()
  );
  assert.deepEqual(
    filterSalesInvoiceRows(rows, { q: "nag" }).map((r) => r.invoiceId).sort(),
    ["jan", "mar", "orphan-named"]
  );

  const january = filterSalesInvoiceRows(rows, {
    q: "nagpur",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
  });
  assert.deepEqual(
    january.map((r) => r.invoiceId).sort(),
    ["jan", "orphan-named"]
  );

  assert.deepEqual(
    filterSalesInvoiceRows(rows, { q: "plain" }).map((r) => r.invoiceId),
    ["blank"]
  );

  assert.deepEqual([...SALES_INVOICE_EXPORT_HEADERS], [
    "Project",
    "Project no.",
    "Invoice no.",
    "Invoice date",
    "Net amount",
    "GST amount",
    "Other amount",
    "Total amount",
  ]);
  assertNoCityColumn(
    SALES_INVOICE_EXPORT_HEADERS,
    byCity.map(salesInvoiceExportRow),
    NAGPUR
  );
});

test("operations summary matches contract city and exports without a city column", () => {
  const data = workspace({
    contracts: [
      contract({
        id: "c-nag",
        projectNo: "P-N",
        projectName: "North shed",
        city: NAGPUR,
        boq: [
          {
            id: "panel",
            catalogKey: "panel",
            name: "Panel",
            unit: "Nos",
            rate: 10,
            quantity: 4,
          },
        ],
      }),
      contract({
        id: "c-sur",
        projectNo: "P-S",
        projectName: "South shed",
        city: SURAT,
        boq: [
          {
            id: "cable",
            catalogKey: "cable",
            name: "Cable",
            unit: "m",
            rate: 2,
            quantity: 8,
          },
        ],
      }),
    ],
    deliveryChallans: [],
    installationProgress: [],
    invoices: [],
  });
  const rows = buildExecutionSummaryRows(data);
  const kept = filterExecutionSummaryRows(rows, "NAG");
  assert.deepEqual(
    kept.map((r) => r.boqItemId),
    ["panel"]
  );
  assert.equal(kept[0]?.city, NAGPUR);
  assert.equal(filterExecutionSummaryRows(rows, "surat").length, 1);
  assert.equal(filterExecutionSummaryRows(rows, "").length, 2);

  assert.equal(
    EXECUTION_SUMMARY_EXPORT_HEADERS.some(
      (header) => header.toLowerCase() === "city"
    ),
    false
  );
  assertNoCityColumn(
    EXECUTION_SUMMARY_EXPORT_HEADERS,
    kept.map(executionSummaryExportRow),
    NAGPUR
  );
});

test("DC records match contract city inside the date range and export without city", () => {
  const nagpur = contract({
    id: "c-nag",
    projectNo: "P-N",
    projectName: "North shed",
    city: NAGPUR,
    boq: [
      {
        id: "panel",
        catalogKey: "panel",
        name: "Panel",
        unit: "Nos",
        rate: 1,
        quantity: 2,
      },
    ],
  });
  const surat = contract({
    id: "c-sur",
    projectNo: "P-S",
    projectName: "South shed",
    city: SURAT,
  });
  const rows = buildSupplyDetailRows(
    workspace({
      contracts: [nagpur, surat],
      deliveryChallans: [
        challan({
          id: "dc-jan",
          contractId: nagpur.id,
          dcNo: "DC-1",
          date: "2026-01-10",
        }),
        challan({
          id: "dc-mar",
          contractId: nagpur.id,
          dcNo: "DC-2",
          date: "2026-03-10",
        }),
        challan({
          id: "dc-sur",
          contractId: surat.id,
          dcNo: "DC-3",
          date: "2026-01-10",
        }),
        challan({
          id: "dc-orphan",
          contractId: "missing",
          dcNo: "DC-X",
          date: "2026-01-10",
        }),
        challan({
          id: "dc-orphan-named",
          contractId: "missing",
          dcNo: "DC-NAGPUR",
          date: "2026-01-10",
        }),
      ],
    })
  );

  assert.equal(rows.find((r) => r.dcId === "dc-orphan")?.city, "");
  assert.equal(rows.find((r) => r.dcId === "dc-jan")?.city, NAGPUR);

  const byCity = filterSupplyDetailRows(rows, { q: "nagpur" });
  assert.deepEqual(
    byCity.map((r) => r.dcId).sort(),
    ["dc-jan", "dc-mar", "dc-orphan-named"]
  );
  const january = filterSupplyDetailRows(rows, {
    q: "SuRaT",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
  });
  assert.deepEqual(
    january.map((r) => r.dcId),
    ["dc-sur"]
  );
  assert.deepEqual(
    filterSupplyDetailRows(rows, {
      q: "nagpur",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    }).map((r) => r.dcId),
    ["dc-mar"]
  );

  assert.deepEqual([...DC_RECORDS_EXPORT_HEADERS], [
    "Project",
    "Project no.",
    "DC no.",
    "DC date",
    "Item",
    "Qty supplied",
  ]);
  assertNoCityColumn(
    DC_RECORDS_EXPORT_HEADERS,
    byCity.map(supplyDetailExportRow),
    NAGPUR
  );
});

test("one city token filters every accounts tab and none of them export city", () => {
  const nagpur = contract({
    id: "c-nag",
    projectNo: "P-N",
    projectName: "North shed",
    city: NAGPUR,
    orderValue: 1000,
    abgNumber: "ABG-1",
    abgDate: "2026-01-01",
    abgExpiry: "2027-01-01",
    abgValue: 100,
    abgBankName: "State Bank",
    abgRetrieved: false,
    expenses: [
      expense({ id: "e-jan", date: "2026-01-12" }),
      expense({ id: "e-mar", date: "2026-03-12" }),
    ],
  });
  const surat = contract({
    id: "c-sur",
    projectNo: "P-S",
    projectName: "South shed",
    city: SURAT,
    orderValue: 1000,
    abgNumber: "ABG-2",
    abgDate: "2026-01-01",
    abgExpiry: "2027-01-01",
    abgValue: 80,
    abgBankName: "Harbour Bank",
    abgRetrieved: false,
    expenses: [expense({ id: "e-sur", date: "2026-01-12" })],
  });
  const namedInvoice = invoice({
    id: "inv-named",
    contractId: "missing",
    number: "NAGPUR-TI",
    date: "2026-01-20",
  });
  const data = workspace({
    contracts: [nagpur, surat],
    invoices: [namedInvoice],
    payments: [
      pay({
        id: "pay-jan",
        contractId: nagpur.id,
        date: "2026-01-11",
        retentionAmount: 25,
      }),
      pay({
        id: "pay-mar",
        contractId: nagpur.id,
        date: "2026-03-11",
        retentionAmount: 5,
      }),
      pay({
        id: "pay-sur",
        contractId: surat.id,
        date: "2026-01-11",
        retentionAmount: 15,
      }),
      pay({
        id: "pay-orphan",
        contractId: "missing",
        date: "2026-01-11",
      }),
      pay({
        id: "pay-orphan-named",
        contractId: "missing",
        invoiceId: namedInvoice.id,
        link: "TI",
        date: "2026-01-20",
      }),
    ],
  });

  const collections = buildCollectionRows(data);
  assert.equal(collections.find((r) => r.paymentId === "pay-orphan")?.city, "");
  const collectionHit = filterCollectionRows(collections, { q: "nagpur" });
  assert.deepEqual(
    collectionHit.map((r) => r.paymentId).sort(),
    ["pay-jan", "pay-mar", "pay-orphan-named"]
  );
  assert.equal(
    collectionHit.find((r) => r.paymentId === "pay-orphan-named")?.city,
    ""
  );
  assert.deepEqual(
    filterCollectionRows(collections, {
      q: "nagpur",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
    })
      .map((r) => r.paymentId)
      .sort(),
    ["pay-jan", "pay-orphan-named"]
  );

  const guarantees = filterBankGuaranteeRows(
    buildBankGuaranteeRows(data),
    "nagpur"
  );
  assert.deepEqual(
    guarantees.map((r) => r.contractId),
    [nagpur.id]
  );
  assert.equal(
    filterBankGuaranteeRows(buildBankGuaranteeRows(data), "surat").length,
    1
  );

  const retentions = filterRetentionHeldRows(
    buildRetentionHeldRows(data),
    "NAGPUR"
  );
  assert.deepEqual(
    retentions.map((r) => r.contractId),
    [nagpur.id]
  );
  assert.equal(retentions[0]?.city, NAGPUR);

  const expenses = buildExpenseReportRows(data);
  assert.deepEqual(
    filterExpenseReportRows(expenses, { q: "nag" })
      .map((r) => r.expenseId)
      .sort(),
    ["e-jan", "e-mar"]
  );
  assert.deepEqual(
    filterExpenseReportRows(expenses, {
      q: "nagpur",
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
    }).map((r) => r.expenseId),
    ["e-mar"]
  );

  assert.deepEqual([...COLLECTION_EXPORT_HEADERS], [
    "DATE",
    "CONTRACT",
    "PROJECT NO.",
    "AGAINST",
    "CASH RECEIVED NET",
    "CASH RECEIVED GST",
    "CASH RECEIVED TOTAL",
    "RETENTION",
    "TDS",
    "OTHER DEDUCTIONS",
  ]);
  assert.deepEqual([...BANK_GUARANTEE_EXPORT_HEADERS], [
    "PROJECT",
    "PROJECT NO.",
    "TYPE",
    "GUARANTEE #",
    "DATE",
    "VALUE",
    "BANK",
    "EXPIRY",
    "STATUS",
    "RETRIEVAL",
  ]);
  assert.deepEqual([...RETENTION_EXPORT_HEADERS], [
    "PROJECT",
    "PROJECT NO.",
    "RETENTION HELD",
    "STATUS",
    "RECOVERED ON",
  ]);
  assert.deepEqual([...EXPENSE_REPORT_EXPORT_HEADERS], [
    "PROJECT",
    "PROJECT NO.",
    "DATE",
    "EXPENSE TYPE",
    "EXPENSE PERSON",
    "AMOUNT",
  ]);

  assertNoCityColumn(
    COLLECTION_EXPORT_HEADERS,
    collectionHit.map(collectionExportRow),
    NAGPUR
  );
  assertNoCityColumn(
    BANK_GUARANTEE_EXPORT_HEADERS,
    guarantees.map(bankGuaranteeExportRow),
    NAGPUR
  );
  assertNoCityColumn(
    RETENTION_EXPORT_HEADERS,
    retentions.map(retentionExportRow),
    NAGPUR
  );
  assertNoCityColumn(
    EXPENSE_REPORT_EXPORT_HEADERS,
    filterExpenseReportRows(expenses, { q: "nagpur" }).map(expenseReportExportRow),
    NAGPUR
  );
});
