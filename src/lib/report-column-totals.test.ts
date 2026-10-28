import assert from "node:assert/strict";
import test from "node:test";
import {
  BANK_GUARANTEE_EXPORT_HEADERS,
  INVOICE_LIST_EXPORT_HEADERS,
  OPEN_PROFORMA_EXPORT_HEADERS,
  SALES_CONTRACT_EXPORT_HEADERS,
  SALES_INVOICE_EXPORT_HEADERS,
  bankGuaranteeTotalExportRow,
  invoiceListTotalExportRow,
  proformaTotalExportRow,
  salesContractTotalExportRow,
  salesInvoiceTotalExportRow,
  sumBankGuaranteeValue,
  sumInvoiceListColumns,
  sumOpenOutstanding,
  sumProformaFinalAmounts,
  sumSalesContractMoneyColumns,
  sumSalesInvoiceColumns,
  type InvoiceOutstandingRow,
} from "@/lib/reports";
import {
  WORKORDER_SUMMARY_EXPORT_HEADERS,
  sumWorkorderMoneyColumns,
  workorderMoneyTotalExportRow,
} from "@/lib/execution-reports";

test("invoice list total sums the listed money columns and leaves due days out", () => {
  const listed = [
    { finalAmount: 1000, paid: 400, outstanding: 600, daysUntilDue: 12 },
    { finalAmount: 250.5, paid: 0.005, outstanding: 50, daysUntilDue: -3 },
    { finalAmount: 10, paid: -1, outstanding: 0, daysUntilDue: 1 },
  ] as InvoiceOutstandingRow[];
  const dropped = {
    finalAmount: 9999,
    paid: 9999,
    outstanding: 9999,
    daysUntilDue: 99,
  } as InvoiceOutstandingRow;

  const totals = sumInvoiceListColumns(listed);
  assert.equal(totals.tiAmount, 1260.5);
  assert.equal(totals.paid, 400);
  assert.equal(totals.outstanding, 650);
  assert.equal("daysUntilDue" in totals, false);
  assert.notEqual(totals.outstanding, sumOpenOutstanding(listed));
  assert.notEqual(
    sumInvoiceListColumns([...listed, dropped]).tiAmount,
    totals.tiAmount
  );

  const line = invoiceListTotalExportRow(totals);
  assert.equal(line.length, INVOICE_LIST_EXPORT_HEADERS.length);
  assert.equal(line[0], "Total");
  assert.equal(line[INVOICE_LIST_EXPORT_HEADERS.indexOf("TI amount")], 1260.5);
  assert.equal(line[INVOICE_LIST_EXPORT_HEADERS.indexOf("Paid")], 400);
  assert.equal(line[INVOICE_LIST_EXPORT_HEADERS.indexOf("Outstanding")], 650);
  assert.equal(line[INVOICE_LIST_EXPORT_HEADERS.indexOf("Due days")], "");
  assert.equal(line[INVOICE_LIST_EXPORT_HEADERS.indexOf("Status")], "");
  assert.deepEqual(invoiceListTotalExportRow(sumInvoiceListColumns([])), [
    "Total",
    "",
    "",
    "",
    "",
    0,
    0,
    0,
    "",
    "",
    "",
  ]);
});

test("proforma total sums final amount and leaves days open blank", () => {
  const total = sumProformaFinalAmounts([
    { finalAmount: 80 },
    { finalAmount: 20.25 },
  ]);
  assert.equal(total, 100.25);
  const line = proformaTotalExportRow(total);
  assert.equal(line.length, OPEN_PROFORMA_EXPORT_HEADERS.length);
  assert.deepEqual(line, ["Total", "", "", "", "", 100.25, ""]);
  assert.equal(sumProformaFinalAmounts([]), 0);
});

test("sales invoice total sums net, GST, other, and total amount", () => {
  const totals = sumSalesInvoiceColumns([
    { net: 100, gst: 18, other: 5, total: 123 },
    { net: 40, gst: 7.2, other: 0, total: 47.2 },
  ]);
  assert.deepEqual(totals, { net: 140, gst: 25.2, other: 5, total: 170.2 });
  const line = salesInvoiceTotalExportRow(totals);
  assert.equal(line.length, SALES_INVOICE_EXPORT_HEADERS.length);
  assert.deepEqual(line, ["Total", "", "", "", 140, 25.2, 5, 170.2]);
});

test("sales contract total sums the money columns and skips outstanding net", () => {
  const rows = [
    {
      woValue: 1000,
      totalInvoiceNet: 400,
      leftoverBilling: 600,
      totalPaid: 100,
      totalOutstanding: 300,
      totalOutstandingNet: 9999,
    },
    {
      woValue: 500,
      totalInvoiceNet: 700,
      leftoverBilling: -200,
      totalPaid: 50,
      totalOutstanding: 20,
      totalOutstandingNet: 1,
    },
  ];
  const totals = sumSalesContractMoneyColumns(rows);
  assert.deepEqual(totals, {
    woValue: 1500,
    totalInvoice: 1100,
    leftoverBilling: 400,
    totalPaid: 150,
    totalOutstanding: 320,
  });
  assert.equal("totalOutstandingNet" in totals, false);
  const line = salesContractTotalExportRow(totals);
  assert.equal(line.length, SALES_CONTRACT_EXPORT_HEADERS.length);
  assert.deepEqual(line, ["Total", "", "", 1500, 1100, 400, 150, 320]);
  assert.equal(line.includes(9999), false);
});

test("bank guarantee total sums value only", () => {
  const value = sumBankGuaranteeValue([{ value: 1000 }, { value: 250.5 }]);
  assert.equal(value, 1250.5);
  const line = bankGuaranteeTotalExportRow(value);
  assert.equal(line.length, BANK_GUARANTEE_EXPORT_HEADERS.length);
  assert.equal(line[BANK_GUARANTEE_EXPORT_HEADERS.indexOf("VALUE")], 1250.5);
  assert.equal(line[BANK_GUARANTEE_EXPORT_HEADERS.indexOf("STATUS")], "");
  assert.equal(sumBankGuaranteeValue([]), 0);
});

test("work order total sums the money columns and rounds the whole-rupee ones", () => {
  const totals = sumWorkorderMoneyColumns([
    { woValue: 1000, yetToBill: 1.4, yetToCollect: 10.6, currentDue: 40 },
    { woValue: 500.5, yetToBill: 1.4, yetToCollect: 0.4, currentDue: 2.5 },
  ]);
  assert.equal(totals.woValue, 1500.5);
  assert.equal(totals.yetToBill, 2.8);
  assert.equal(totals.yetToCollect, 11);
  assert.equal(totals.currentDue, 42.5);
  const line = workorderMoneyTotalExportRow(totals);
  assert.equal(line.length, WORKORDER_SUMMARY_EXPORT_HEADERS.length);
  assert.equal(line[WORKORDER_SUMMARY_EXPORT_HEADERS.indexOf("WO value")], 1500.5);
  assert.equal(line[WORKORDER_SUMMARY_EXPORT_HEADERS.indexOf("Yet to Bill")], 3);
  assert.equal(
    line[WORKORDER_SUMMARY_EXPORT_HEADERS.indexOf("Yet to Collect")],
    11
  );
  assert.equal(line[WORKORDER_SUMMARY_EXPORT_HEADERS.indexOf("Current Due")], 42.5);
  assert.equal(line[WORKORDER_SUMMARY_EXPORT_HEADERS.indexOf("Status")], "");
});
