import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import type { Contract, FlowhubData, Payment } from "@/lib/types";
import { buildReportExcelBuffer, buildReportPdfBytes } from "@/components/report-export-icons";
import { recoverableRunningLineFigures } from "@/lib/store";
import {
  RECOVERABLE_ADVANCES_HEADERS,
  buildRecoverableAdvanceRows,
  recoverableAdvanceExportRows,
  recoverableAdvanceProjectCell,
  sumRecoverableAdvances,
} from "@/lib/recoverable-advances-report";

function contract(
  partial: Pick<Contract, "id"> & Partial<Contract>
): Contract {
  return {
    projectNo: partial.id,
    projectName: partial.id,
    city: "Delhi",
    orderValue: 1_000_000,
    billingTerms: { advance: 40, supply: 60 },
    ...partial,
  } as Contract;
}

function pay(
  partial: Partial<Payment> & Pick<Payment, "id" | "contractId">
): Payment {
  return {
    invoiceId: null,
    link: "unlinked",
    date: "2026-02-01",
    netAmount: 0,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
    createdAt: "2026-02-01T00:00:00.000Z",
    ...partial,
  };
}

function workspace(
  contracts: Contract[],
  payments: Payment[]
): FlowhubData {
  return { contracts, payments } as FlowhubData;
}

test("advance is the recoverable pool, not the billing-term percent", () => {
  const open = contract({
    id: "open",
    projectNo: "P-2",
    projectName: "Open pool",
    orderValue: 1_000_000,
    billingTerms: { advance: 40, supply: 60 },
  });
  const settled = contract({
    id: "settled",
    projectNo: "P-1",
    projectName: "Settled pool",
    orderValue: 500_000,
    billingTerms: { advance: 100 },
  });
  const billingOnly = contract({
    id: "billing-only",
    projectNo: "P-9",
    projectName: "Term only",
    orderValue: 800_000,
    billingTerms: { advance: 25, supply: 75 },
  });
  const payments = [
    pay({
      id: "rec-1",
      contractId: open.id,
      link: "recoverable",
      netAmount: 1000.5,
      gstAmount: 180.25,
      retentionAmount: 5000,
      tdsAmount: 2000,
      otherDeductions: 900,
      recovered: 999,
    }),
    pay({
      id: "rec-2",
      contractId: open.id,
      link: "recoverable",
      netAmount: 0,
      gstAmount: 18,
    }),
    pay({
      id: "ti-cash",
      contractId: open.id,
      link: "TI",
      invoiceId: "ti-open",
      netAmount: 50_000,
      gstAmount: 9_000,
      recovered: 400,
    }),
    pay({
      id: "pi-cash",
      contractId: open.id,
      link: "PI",
      invoiceId: "pi-open",
      netAmount: 80_000,
      gstAmount: 14_400,
      recovered: 80_000,
    }),
    pay({
      id: "un-cash",
      contractId: open.id,
      link: "unlinked",
      netAmount: 30_000,
      gstAmount: 5_400,
      recovered: 30_000,
    }),
    pay({
      id: "rec-settled",
      contractId: settled.id,
      link: "recoverable",
      netAmount: 200,
      gstAmount: 36,
      retentionAmount: 10,
      tdsAmount: 10,
      otherDeductions: 10,
    }),
    pay({
      id: "ti-settled",
      contractId: settled.id,
      link: "TI",
      invoiceId: "ti-settled",
      netAmount: 10_000,
      gstAmount: 1_800,
      recovered: 236,
    }),
    pay({
      id: "ti-billing",
      contractId: billingOnly.id,
      link: "TI",
      invoiceId: "ti-billing",
      netAmount: 10_000,
      gstAmount: 1_800,
      recovered: 10_000,
    }),
  ];
  const data = workspace([open, settled, billingOnly], payments);
  const rows = buildRecoverableAdvanceRows(data);

  assert.deepEqual(
    rows.map((r) => r.contractId),
    ["settled", "open"]
  );

  const openRow = rows[1]!;
  const openFigures = recoverableRunningLineFigures(payments, open.id);
  assert.equal(openRow.advance, openFigures.pool);
  assert.equal(openRow.recovered, openFigures.recovered);
  assert.equal(openRow.left, openFigures.left);
  assert.equal(openRow.advance, 1000.5 + 180.25 + 18);
  assert.equal(openRow.recovered, 400);
  assert.equal(openRow.left, openRow.advance - openRow.recovered);
  assert.notEqual(openRow.advance, (1_000_000 * 40) / 100);

  const settledRow = rows[0]!;
  const settledFigures = recoverableRunningLineFigures(payments, settled.id);
  assert.equal(settledRow.advance, settledFigures.pool);
  assert.equal(settledRow.recovered, settledFigures.recovered);
  assert.equal(settledRow.left, settledFigures.left);
  assert.equal(settledRow.advance, 236);
  assert.equal(settledRow.recovered, 236);
  assert.equal(settledRow.left, 0);
  assert.notEqual(settledRow.advance, 500_000);

  assert.equal(
    rows.some((r) => r.contractId === billingOnly.id),
    false
  );

  const totals = sumRecoverableAdvances(rows);
  assert.equal(totals.advance, openRow.advance + settledRow.advance);
  assert.equal(totals.recovered, openRow.recovered + settledRow.recovered);
  assert.equal(totals.left, openRow.left + settledRow.left);
});

test("export headers are the four capital labels, including a zero left", async () => {
  assert.deepEqual([...RECOVERABLE_ADVANCES_HEADERS], [
    "PROJECT NAME AND NO.",
    "ADVANCE",
    "RECOVERED",
    "LEFT TO RECOVER",
  ]);

  const rows = buildRecoverableAdvanceRows(
    workspace(
      [
        contract({
          id: "settled",
          projectNo: "WO-7",
          projectName: "Gate house",
        }),
        contract({
          id: "open",
          projectNo: "WO-8",
          projectName: "Yard",
        }),
      ],
      [
        pay({
          id: "rec-settled",
          contractId: "settled",
          link: "recoverable",
          netAmount: 100.5,
          gstAmount: 18,
        }),
        pay({
          id: "ti-settled",
          contractId: "settled",
          link: "TI",
          invoiceId: "ti-settled",
          netAmount: 1000,
          recovered: 118.5,
        }),
        pay({
          id: "rec-open",
          contractId: "open",
          link: "recoverable",
          netAmount: 10,
          gstAmount: 0.5,
        }),
        pay({
          id: "ti-open",
          contractId: "open",
          link: "TI",
          invoiceId: "ti-open",
          netAmount: 1000,
          recovered: 4.25,
        }),
      ]
    )
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.left, 0);
  assert.equal(
    recoverableAdvanceProjectCell(rows[0]!),
    "Gate house\nWO-7"
  );

  const exported = recoverableAdvanceExportRows(rows);
  assert.deepEqual(exported, [
    ["Gate house\nWO-7", 118.5, 118.5, 0],
    ["Yard\nWO-8", 10.5, 4.25, 6.25],
    ["Total", 129, 122.75, 6.25],
  ]);

  const props = {
    filename: "recoverable-advances",
    title: "Other Reports — Recoverable advances",
    filters: "Tab: Recoverable advances",
    headers: [...RECOVERABLE_ADVANCES_HEADERS],
    rows: exported,
  };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(await buildReportExcelBuffer(props)) as unknown as ExcelJS.Buffer
  );
  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(5);
  assert.deepEqual(
    RECOVERABLE_ADVANCES_HEADERS.map((_, i) => headerRow.getCell(i + 1).value),
    [...RECOVERABLE_ADVANCES_HEADERS]
  );
  const dataRow = sheet.getRow(6);
  assert.equal(dataRow.getCell(1).value, "Gate house\nWO-7");
  assert.equal(dataRow.getCell(2).value, 118.5);
  assert.equal(dataRow.getCell(3).value, 118.5);
  assert.equal(dataRow.getCell(4).value, 0);
  assert.equal(sheet.getRow(8).getCell(1).value, "Total");
  const openRow = sheet.getRow(7);
  assert.equal(openRow.getCell(2).numFmt, "#,##0.00");
  assert.equal(openRow.getCell(3).numFmt, "#,##0.00");
  assert.equal(openRow.getCell(4).numFmt, "#,##0.00");

  const dir = mkdtempSync(path.join(tmpdir(), "nexus-advances-"));
  const file = path.join(dir, "report.pdf");
  writeFileSync(file, await buildReportPdfBytes(props));
  const text = execFileSync("pdftotext", ["-layout", file, "-"], {
    encoding: "utf8",
  });
  for (const header of RECOVERABLE_ADVANCES_HEADERS) {
    assert.match(text, new RegExp(header.replace(/[.]/g, "\\.")));
  }
  assert.match(text, /Gate house/);
  assert.match(text, /WO-7/);
});
