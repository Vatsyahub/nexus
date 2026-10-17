import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import type { FlowhubData } from "@/lib/types";
import {
  buildReportExcelBuffer,
  buildReportPdfBytes,
} from "@/components/report-export-icons";
import {
  EXECUTION_SUMMARY_EXPORT_HEADERS,
  buildExecutionSummaryRows,
  buildItemListRows,
  executionSummaryExportRow,
  itemListCities,
  itemListExportRow,
  itemListHeaders,
} from "@/lib/execution-reports";

const summaryData = {
  contracts: [
    {
      id: "c1",
      projectNo: "P-1",
      projectName: "North shed",
      city: "Pune",
      status: "active",
      boq: [
        {
          id: "panel",
          catalogKey: "panel",
          name: "Panel",
          unit: "Nos",
          rate: 10,
          quantity: 20,
        },
      ],
    },
  ],
  deliveryChallans: [
    {
      id: "dc1",
      contractId: "c1",
      dcNo: "DC-1",
      date: "2026-10-01",
      lines: [{ boqItemId: "panel", qty: 10 }],
      createdAt: "2026-10-01T00:00:00.000Z",
      createdBy: null,
    },
  ],
  installationProgress: [
    {
      id: "inst",
      contractId: "c1",
      boqItemId: "panel",
      installedQty: 7,
      lastUpdatedAt: "2026-10-02",
      history: [],
    },
  ],
  invoices: [
    {
      id: "pi",
      type: "PI",
      number: "PI-1",
      date: "2026-10-03",
      contractId: "c1",
      lines: [
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "supply",
          billedQty: 100,
          rate: 10,
          termPercent: 100,
          lineNet: 1000,
        },
      ],
      netAmount: 0,
      gstAmount: 0,
      extraCharges: [],
      finalAmount: 0,
      convertedFromPiId: null,
      createdAt: "2026-10-03T00:00:00.000Z",
    },
    {
      id: "ti",
      type: "TI",
      number: "TI-1",
      date: "2026-10-04",
      contractId: "c1",
      lines: [
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "supply",
          billedQty: 12,
          rate: 10,
          termPercent: 70,
          lineNet: 84,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "installation",
          billedQty: 4,
          rate: 10,
          termPercent: 30,
          lineNet: 12,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "advance",
          billedQty: 9,
          rate: 10,
          termPercent: 10,
          lineNet: 9,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "gad",
          billedQty: 9,
          rate: 10,
          termPercent: 10,
          lineNet: 9,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "testing",
          billedQty: 9,
          rate: 10,
          termPercent: 10,
          lineNet: 9,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "handover",
          billedQty: 9,
          rate: 10,
          termPercent: 10,
          lineNet: 9,
        },
        {
          boqItemId: "panel",
          itemName: "Panel",
          termKey: "custom_stage",
          billedQty: 9,
          rate: 10,
          termPercent: 10,
          lineNet: 9,
        },
      ],
      netAmount: 0,
      gstAmount: 0,
      extraCharges: [],
      finalAmount: 0,
      convertedFromPiId: null,
      createdAt: "2026-10-04T00:00:00.000Z",
    },
  ],
  schedules: [],
  tasks: [],
  itemCatalog: [],
  payments: [],
  scheduleChangeLog: [],
  notifications: [],
  customDepartments: [],
  expenseCategories: [],
} as unknown as FlowhubData;

function pdfText(bytes: Uint8Array): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nexus-pdf-"));
  const file = path.join(dir, "report.pdf");
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
}

test("summary excel and pdf add unbilled columns after left for installation", async () => {
  const rows = buildExecutionSummaryRows(summaryData);
  const [row] = rows;
  assert.equal(row.supplied, 10);
  assert.equal(row.installed, 7);
  assert.equal(row.leftToSupply, 10);
  assert.equal(row.leftToInstall, 3);
  assert.equal(row.unbilledSupplyQty, 0);
  assert.equal(row.unbilledInstallQty, 3);

  const headers = [...EXECUTION_SUMMARY_EXPORT_HEADERS];
  const exported = rows.map((r) => executionSummaryExportRow(r));
  const props = {
    filename: "execution-summary",
    title: "Operations — Execution summary",
    filters: "Tab: Summary",
    singleLineHeaders: true,
    headers,
    rows: exported,
  };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(await buildReportExcelBuffer(props)) as unknown as ExcelJS.Buffer
  );
  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(5);
  const headerValues = headers.map((_, i) => headerRow.getCell(i + 1).value);
  assert.deepEqual(headerValues, headers);
  assert.equal(headerValues.at(-3), "Left for installation");
  assert.equal(headerValues.at(-2), "Unbilled Supply Qty");
  assert.equal(headerValues.at(-1), "Unbilled Install Qty");
  for (const cell of headers.map((_, i) => headerRow.getCell(i + 1))) {
    assert.equal(String(cell.value).includes("\n"), false);
    assert.notEqual(cell.alignment?.wrapText, true);
  }
  const dataRow = sheet.getRow(6);
  assert.deepEqual(
    headers.map((_, i) => dataRow.getCell(i + 1).value),
    exported[0]
  );

  const text = pdfText(await buildReportPdfBytes(props));
  const headerLine = text
    .split("\n")
    .find((line) => line.includes("Unbilled Supply Qty"));
  assert.ok(headerLine);
  assert.match(headerLine, /Left for installation\s+Unbilled Supply Qty\s+Unbilled Install Qty/);
  assert.match(text, /North shed/);
  assert.equal(headerLine.includes("\n"), false);
});

test("item list excel and pdf put pending for supply before cities", async () => {
  const itemData = {
    ...summaryData,
    contracts: [
      {
        ...summaryData.contracts[0],
        city: "Pune",
        boq: [
          {
            id: "panel",
            catalogKey: "panel",
            name: "Panel",
            unit: "Nos",
            rate: 10,
            quantity: 20,
          },
        ],
      },
      {
        id: "c2",
        projectNo: "P-2",
        projectName: "South shed",
        city: "Delhi",
        status: "active",
        boq: [
          {
            id: "panel-2",
            catalogKey: "panel",
            name: "Panel",
            unit: "Nos",
            rate: 10,
            quantity: 4,
          },
        ],
      },
    ],
  } as FlowhubData;

  const cities = itemListCities(itemData);
  assert.deepEqual(cities, ["Delhi", "Pune"]);
  const headers = itemListHeaders(cities);
  const built = buildItemListRows(itemData);
  const exported = built.map((row) => itemListExportRow(cities, row));
  assert.deepEqual(headers, [
    "Item name",
    "Total BOQ qty",
    "Total supplied",
    "Pending for supply",
    "Delhi",
    "Pune",
  ]);
  assert.equal(headers.includes("Left for supply"), false);

  const props = {
    filename: "execution-item-list",
    title: "Operations — Item list",
    filters: "Tab: Item list",
    singleLineHeaders: true,
    headers,
    rows: exported,
  };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(await buildReportExcelBuffer(props)) as unknown as ExcelJS.Buffer
  );
  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(5);
  assert.deepEqual(
    headers.map((_, i) => headerRow.getCell(i + 1).value),
    headers
  );
  for (const cell of headers.map((_, i) => headerRow.getCell(i + 1))) {
    assert.equal(String(cell.value).includes("\n"), false);
    assert.notEqual(cell.alignment?.wrapText, true);
  }
  const dataRow = sheet.getRow(6);
  assert.deepEqual(
    headers.map((_, i) => dataRow.getCell(i + 1).value),
    exported[0]
  );

  const text = pdfText(await buildReportPdfBytes(props));
  const headerLine = text
    .split("\n")
    .find((line) => line.includes("Pending for supply"));
  assert.ok(headerLine);
  assert.match(
    headerLine,
    /Item name\s+Total BOQ qty\s+Total supplied\s+Pending for supply\s+Delhi\s+Pune/
  );
});
