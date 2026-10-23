import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  buildReportExcelBuffer,
  buildReportPdfBytes,
} from "@/components/report-export-icons";
import {
  buildInvoiceOutstandingRows,
  buildOpenPiRows,
  buildReconciliationDetail,
  buildSalesInvoiceRows,
  salesInvoiceExportRow,
  SALES_INVOICE_EXPORT_HEADERS,
} from "@/lib/reports";
import {
  addContract,
  addInvoice,
  addPayment,
  convertPiToTi,
  getData,
  invoiceExpectedCash,
  invoiceExtraTotal,
  invoiceOutstanding,
  invoicePaidAmount,
  keptInvoiceExtraCharges,
  updateInvoice,
} from "@/lib/store";
import { GST_RATE, type Invoice, type InvoiceLine, type InvoiceType } from "@/lib/types";

const NET = 1000;
const GST = NET * GST_RATE;
const BASE = NET + GST;
const RETENTION = 50;
const TDS = 20;

function line(): InvoiceLine {
  return {
    boqItemId: "boq-neg-charge",
    itemName: "Panel",
    termKey: "supply",
    billedQty: 1,
    rate: NET,
    termPercent: 100,
    lineNet: NET,
  };
}

function contract() {
  return addContract({
    projectName: "Negative charge",
    projectNo: "C-NEG-CHG",
    orderNos: "T-NEG",
    orderDate: "2026-10-01",
    closureDate: "2026-12-31",
    orderValue: 20_000,
    gstApplicable: true,
    city: "Delhi",
    state: "Delhi",
    country: "India",
    billingTerms: { supply: 100 },
    paymentDueDays: 30,
    retentionPercent: 5,
    tdsPercent: 2,
    dlpMonths: 12,
    abgRequired: false,
    abgPercent: null,
    abgValue: null,
    pbgRequired: false,
    pbgPercent: null,
    pbgValue: null,
    contractorAssigned: "",
    boq: [
      {
        id: "boq-neg-charge",
        catalogKey: "panel-neg",
        name: "Panel",
        unit: "Nos",
        rate: NET,
        quantity: 20,
      },
    ],
  }).contract;
}

function save(
  type: InvoiceType,
  number: string,
  contractId: string,
  extraCharges: Invoice["extraCharges"]
) {
  const invoice = addInvoice({
    type,
    number,
    date: "2026-10-02",
    contractId,
    lines: [line()],
    extraCharges,
  });
  assert.ok(invoice);
  return invoice;
}

test("a filled non-zero charge is kept with its sign", () => {
  const kept = keptInvoiceExtraCharges([
    { id: "discount", label: " Discount ", amount: "-100" },
    { id: "freight", label: "Freight", amount: "40" },
    { id: "zero", label: "Waived", amount: "0" },
    { id: "blank", label: "Blank", amount: "" },
    { id: "spaces", label: "Spaces", amount: "   " },
    { id: "missing", label: "Missing", amount: null },
    { label: "  ", amount: -50 },
    { label: "", amount: 20 },
  ]);
  assert.deepEqual(
    kept.map((charge) => [charge.label, charge.amount]),
    [
      ["Discount", -100],
      ["Freight", 40],
    ]
  );
});

test("a negative extra charge reduces PI and TI totals after GST", () => {
  const job = contract();
  for (const type of ["PI", "TI"] as const) {
    const discount = save(type, `${type}-DISCOUNT`, job.id, [
      { id: "discount", label: "Discount", amount: -100 },
      { id: "zero", label: "Waived", amount: 0 },
      { id: "blank-label", label: "  ", amount: -50 },
    ]);
    assert.deepEqual(
      discount.extraCharges.map((charge) => [charge.label, charge.amount]),
      [["Discount", -100]]
    );
    assert.equal(discount.netAmount, NET);
    assert.equal(discount.gstAmount, GST);
    assert.notEqual(discount.gstAmount, GST + -100 * GST_RATE);
    assert.equal(discount.finalAmount, BASE - 100);
    assert.equal(invoiceExtraTotal(discount), -100);
    assert.equal(
      invoiceExpectedCash(discount),
      discount.finalAmount - RETENTION - TDS
    );

    const mixed = save(type, `${type}-MIXED`, job.id, [
      { id: "discount", label: "Discount", amount: -100 },
      { id: "freight", label: "Freight", amount: 40 },
      { id: "zero", label: "Waived", amount: 0 },
    ]);
    assert.deepEqual(
      mixed.extraCharges.map((charge) => charge.amount),
      [-100, 40]
    );
    assert.equal(mixed.gstAmount, GST);
    assert.equal(mixed.finalAmount, BASE - 100 + 40);
    assert.equal(invoiceExtraTotal(mixed), -60);

    const freight = save(type, `${type}-FREIGHT`, job.id, [
      { id: "freight", label: "Freight", amount: 40 },
    ]);
    assert.equal(freight.extraCharges[0]?.amount, 40);
    assert.equal(freight.finalAmount, BASE + 40);
    assert.equal(freight.lines[0]?.billedQty, 1);
  }
});

test("editing and converting keep a negative charge and still drop zero", () => {
  const job = contract();
  const pi = save("PI", "PI-EDIT", job.id, [
    { id: "freight", label: "Freight", amount: 40 },
  ]);
  const edited = updateInvoice(pi.id, {
    extraCharges: [
      { id: "discount", label: "Discount", amount: -100 },
      { id: "freight", label: "Freight", amount: 40 },
      { id: "zero", label: "Waived", amount: 0 },
    ],
  });
  assert.ok(edited);
  assert.equal(edited.type, "PI");
  assert.deepEqual(
    edited.extraCharges.map((charge) => charge.amount),
    [-100, 40]
  );
  assert.equal(edited.gstAmount, GST);
  assert.equal(edited.finalAmount, BASE - 100 + 40);
  assert.equal(edited.lines[0]?.billedQty, 1);

  const source = save("PI", "PI-CONVERT", job.id, [
    { id: "discount", label: "Discount", amount: -100 },
  ]);
  const ti = convertPiToTi(source.id, "TI-CONVERT", "2026-10-03", {
    lines: source.lines.map((row) => ({ ...row })),
    extraCharges: [
      ...source.extraCharges,
      { id: "zero", label: "Waived", amount: 0 },
    ],
  });
  assert.ok(ti);
  assert.equal(ti.type, "TI");
  assert.deepEqual(
    ti.extraCharges.map((charge) => [charge.label, charge.amount]),
    [["Discount", -100]]
  );
  assert.equal(ti.gstAmount, source.gstAmount);
  assert.equal(ti.finalAmount, source.finalAmount);
  assert.equal(ti.finalAmount, BASE - 100);
});

test("outstanding, expected payment, and PDF and Excel use the reduced total", async () => {
  const job = contract();
  const ti = save("TI", "TI-EXPORT", job.id, [
    { id: "discount", label: "Discount", amount: -100 },
    { id: "freight", label: "Freight", amount: 40 },
    { id: "zero", label: "Waived", amount: 0 },
  ]);
  const pi = save("PI", "PI-EXPORT", job.id, [
    { id: "discount", label: "Discount", amount: -100 },
    { id: "freight", label: "Freight", amount: 40 },
  ]);
  const final = BASE - 60;
  const expected = final - RETENTION - TDS;
  assert.equal(ti.finalAmount, final);
  assert.equal(pi.finalAmount, final);
  assert.equal(invoiceExpectedCash(ti), expected);
  assert.equal(invoiceOutstanding(ti), expected);
  assert.equal(invoicePaidAmount(ti), 0);
  assert.equal(expected, BASE - RETENTION - TDS - 60);

  const payment = addPayment({
    contractId: job.id,
    invoiceId: ti.id,
    link: "TI",
    date: "2026-10-05",
    netAmount: 300,
    gstAmount: 0,
    retentionAmount: 0,
    tdsAmount: 0,
    otherDeductions: 0,
    otherDeductionReason: "",
    recovered: 0,
  });
  assert.ok(payment);
  const data = getData();
  const paid = invoicePaidAmount(ti, data);
  const outstanding = invoiceOutstanding(ti, data);
  assert.equal(paid, 300);
  assert.equal(outstanding, final - paid);
  assert.notEqual(outstanding, BASE - paid);

  const sales = buildSalesInvoiceRows(data).find((row) => row.invoiceId === ti.id);
  assert.ok(sales);
  assert.equal(sales.net, NET);
  assert.equal(sales.gst, GST);
  assert.equal(sales.other, -60);
  assert.equal(sales.total, final);
  const salesExported = salesInvoiceExportRow(sales);
  assert.equal(salesExported[6], -60);
  assert.equal(salesExported[7], final);

  const openPi = buildOpenPiRows(data).find((row) => row.invoiceId === pi.id);
  assert.equal(openPi?.finalAmount, final);

  const outstandingRow = buildInvoiceOutstandingRows(data).find(
    (row) => row.invoiceId === ti.id
  );
  assert.ok(outstandingRow);
  assert.equal(outstandingRow.finalAmount, final);
  assert.equal(outstandingRow.expected, expected);
  assert.equal(outstandingRow.paid, paid);
  assert.equal(outstandingRow.outstanding, outstanding);

  const detail = buildReconciliationDetail(job.id, data);
  const reconciled = detail?.tis.find((row) => row.invoiceId === ti.id);
  assert.ok(reconciled);
  assert.equal(reconciled.extras, -60);
  assert.equal(reconciled.gst, GST);
  assert.equal(reconciled.finalAmount, final);
  assert.equal(reconciled.expected, expected);
  assert.equal(reconciled.outstanding, outstanding);

  const salesFile = {
    filename: "sales-invoices",
    title: "Sales Report — Invoices",
    filters: "Negative charge",
    headers: [...SALES_INVOICE_EXPORT_HEADERS],
    rows: [salesExported],
  };
  const reconciliationFile = {
    filename: "reconciliation",
    title: "Reconciliation",
    filters: "Negative charge",
    headers: ["Extras", "Final TI", "Exp. pay", "Paid", "Outstanding"],
    rows: [
      [
        reconciled.extras,
        reconciled.finalAmount,
        reconciled.expected,
        paid,
        reconciled.outstanding,
      ],
    ],
  };

  for (const file of [salesFile, reconciliationFile]) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(await buildReportExcelBuffer(file)) as unknown as ExcelJS.Buffer
    );
    const sheet = workbook.worksheets[0];
    const values = file.headers.map(
      (_, index) => sheet.getRow(6).getCell(index + 1).value
    );
    assert.deepEqual(values, file.rows[0]);

    const text = pdfText(await buildReportPdfBytes(file));
    assert.match(text, /-60/);
    assert.match(text, /1,120/);
    assert.doesNotMatch(text, /1,180/);
    assert.doesNotMatch(text, /1,220/);
  }
});

function pdfText(bytes: Uint8Array): string {
  const dir = mkdtempSync(path.join(tmpdir(), "nexus-pdf-"));
  const file = path.join(dir, "report.pdf");
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
}
