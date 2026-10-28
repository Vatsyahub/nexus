import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildReportExcelBuffer } from "@/components/report-export-icons";
import {
  WORKORDER_SUMMARY_EXPORT_HEADERS,
  buildWorkorderRows,
  workorderSummaryExportRow,
} from "@/lib/execution-reports";
import {
  buildCoreReportRows,
  formatWholeRupees,
  taxInvoiceNet,
  yetToBillAmount,
  yetToCollectAmount,
} from "@/lib/nexus-core";
import type { Contract, FlowhubData, Invoice, Payment } from "@/lib/types";

/**
 * Chalet Hotel C4940, as confirmed against the Core report:
 * order 38,92,200, GST on, retention 0, TDS 2%,
 * payment nets 6,88,000 + 6,88,000 + 5,00,000, payment GST 0,
 * tax-invoice net 19,50,100.
 * Yet to Collect is ₹26,38,952. Yet to Bill is the order minus that TI net.
 */
test("work order summary matches the core report for Chalet Hotel C4940", async () => {
  const contract = {
    id: "c4940",
    projectName: "Chalet Hotel",
    projectNo: "C4940",
    orderNos: "WO-4940",
    orderDate: "2026-01-15",
    orderValue: 3892200,
    gstApplicable: true,
    retentionPercent: 0,
    tdsPercent: 2,
    city: "Shimla",
    status: "active",
    handoverDate: null,
    dlpMonths: 12,
    amendments: [],
  } as unknown as Contract;
  const other = {
    ...contract,
    id: "other",
    projectNo: "C0001",
    projectName: "Other",
    orderValue: 1000,
    gstApplicable: false,
  } as Contract;
  const payments = [688000, 688000, 500000].map(
    (netAmount, index) =>
      ({
        id: `pay-${index}`,
        contractId: contract.id,
        netAmount,
        gstAmount: 0,
        retentionAmount: 50000,
        tdsAmount: 40000,
        otherDeductions: 0,
      }) as Payment
  );
  payments.push({
    id: "other-pay",
    contractId: other.id,
    netAmount: 999999,
    gstAmount: 999999,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
  } as Payment);
  const invoices = [
    { id: "ti-1", type: "TI", contractId: contract.id, netAmount: 1000000 },
    { id: "ti-2", type: "TI", contractId: contract.id, netAmount: 950100 },
    { id: "pi-1", type: "PI", contractId: contract.id, netAmount: 800000 },
  ] as Invoice[];
  const data = {
    contracts: [other, contract],
    payments,
    invoices,
  } as FlowhubData;

  const row = buildWorkorderRows(data).find((item) => item.contractId === contract.id);
  assert.ok(row);
  const core = buildCoreReportRows(data, "2026-10-28").find(
    (item) => item.contractId === contract.id
  );
  assert.ok(core);
  assert.equal(taxInvoiceNet(data, contract.id), 1950100);
  assert.equal(row.yetToBill, yetToBillAmount(3892200, 1950100));
  assert.equal(row.yetToBill, 3892200 - 1950100);
  assert.equal(row.yetToBill, core.yetToBill);
  assert.equal(
    row.yetToCollect,
    yetToCollectAmount(
      contract,
      payments.filter((payment) => payment.contractId === contract.id)
    )
  );
  assert.equal(row.yetToCollect, 2638952);
  assert.equal(row.yetToCollect, core.yetToCollect);
  assert.equal(formatWholeRupees(row.yetToCollect), "₹26,38,952");
  assert.equal(formatWholeRupees(row.yetToBill), "₹19,42,100");

  const headers = [...WORKORDER_SUMMARY_EXPORT_HEADERS];
  const amendmentsAt = headers.indexOf("Amendments");
  assert.deepEqual(headers.slice(amendmentsAt, amendmentsAt + 3), [
    "Amendments",
    "Yet to Bill",
    "Yet to Collect",
  ]);
  const exported = workorderSummaryExportRow(row);
  assert.equal(exported[amendmentsAt + 1], 1942100);
  assert.equal(exported[amendmentsAt + 2], 2638952);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Buffer.from(
      await buildReportExcelBuffer({
        filename: "workorders-summary",
        title: "Other Reports — Workorders summary",
        filters: "Tab: Workorders summary",
        headers,
        rows: [exported],
      })
    ) as unknown as ExcelJS.Buffer
  );
  const sheet = workbook.worksheets[0];
  const headerRow = sheet.getRow(5);
  const headerValues = headers.map((_, index) => headerRow.getCell(index + 1).value);
  assert.deepEqual(headerValues, headers);
  const dataRow = sheet.getRow(6);
  assert.equal(dataRow.getCell(amendmentsAt + 2).value, 1942100);
  assert.equal(dataRow.getCell(amendmentsAt + 3).value, 2638952);
});
