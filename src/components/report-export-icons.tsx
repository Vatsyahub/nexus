"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type ReportExportCell = string | number | null | undefined;

/** One titled table inside a multi-section export. */
export type ReportExportSection = {
  heading: string;
  note?: string;
  headers: string[];
  rows: ReportExportCell[][];
  /** Printed in place of rows when the section has none. */
  emptyMessage?: string;
};

type Common = {
  /** File name without extension; a date stamp is appended. */
  filename: string;
  /** Report name printed as the big header of the PDF / sheet. */
  title: string;
  /** Period / filters that produced the rows (see `reportFilterSummary`). */
  filters: string;
  className?: string;
};

type Props = Common &
  (
    | { headers: string[]; rows: ReportExportCell[][]; sections?: never }
    | {
        /** Several tables stacked in one PDF / sheet, in this order. */
        sections: ReportExportSection[];
        headers?: never;
        rows?: never;
      }
  );

type Section = {
  heading?: string;
  note?: string;
  headers: string[];
  rows: ReportExportCell[][];
  emptyMessage?: string;
};

function toSections(props: Props): Section[] {
  return props.sections ?? [{ headers: props.headers, rows: props.rows }];
}

/**
 * One-line summary of the filters behind an export. Date keys present (even
 * empty) print a Period entry, so "All dates" is explicit on date-filtered lists.
 */
export function reportFilterSummary(opts: {
  tab?: string | null;
  contract?: string | null;
  search?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dateLabel?: string;
  extra?: Array<[label: string, value: string | null | undefined]>;
}): string {
  const parts: string[] = [];
  if (opts.tab) parts.push(`Tab: ${opts.tab}`);
  if (opts.contract) parts.push(`Contract: ${opts.contract}`);
  for (const [label, value] of opts.extra ?? []) {
    if (value && value.trim()) parts.push(`${label}: ${value.trim()}`);
  }
  const search = (opts.search ?? "").trim();
  if (search) {
    const chips = search.split(/\s+/).map((t) => `"${t}"`);
    parts.push(`Search: ${chips.join(" ")}`);
  }
  if ("dateFrom" in opts || "dateTo" in opts) {
    const from = opts.dateFrom ? formatDisplayDate(opts.dateFrom) : "";
    const to = opts.dateTo ? formatDisplayDate(opts.dateTo) : "";
    const label = opts.dateLabel ?? "Period";
    if (from && to) parts.push(`${label}: ${from} to ${to}`);
    else if (from) parts.push(`${label}: from ${from}`);
    else if (to) parts.push(`${label}: up to ${to}`);
    else parts.push(`${label}: All dates`);
  }
  return parts.length ? parts.join("  ·  ") : "No filters — all records";
}

function stamp() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function safeName(name: string) {
  return name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function exportedLine(rowCount?: number) {
  const at = `Exported ${formatDisplayDateTime(new Date().toISOString())}`;
  if (rowCount == null) return at;
  return `${at}  ·  ${rowCount} row${rowCount === 1 ? "" : "s"}`;
}

/** Longest visual line, so a stacked city cell does not widen the column by both lines. */
function cellTextWidth(v: ReportExportCell): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v.toLocaleString("en-IN").length + 3 : 2;
  }
  const text = String(v ?? "");
  if (!text) return 2;
  return Math.max(...text.split("\n").map((line) => line.length)) + 2;
}

function rowLineCount(row: ReportExportCell[]): number {
  let max = 1;
  for (const v of row) {
    if (typeof v !== "string" || !v.includes("\n")) continue;
    max = Math.max(max, v.split("\n").length);
  }
  return max;
}

/** Columns where every non-empty cell is a number get right-aligned. */
function numericColumns(headers: string[], rows: ReportExportCell[][]) {
  return headers.map(
    (_, i) =>
      rows.length > 0 &&
      rows.some((r) => typeof r[i] === "number") &&
      rows.every((r) => r[i] == null || r[i] === "" || typeof r[i] === "number")
  );
}

function isTotalRow(r: ReportExportCell[]) {
  const first = String(r[0] ?? "").toLowerCase();
  return first === "total" || first === "grand total";
}

const STEEL = { hex: "1B3A4B", rgb: [27, 58, 75] as [number, number, number] };
const HEADER = { hex: "2F5D78", rgb: [47, 93, 120] as [number, number, number] };
const ACCENT = { hex: "E3A008", rgb: [227, 160, 8] as [number, number, number] };
const STRIPE = { hex: "F1F5F8", rgb: [241, 245, 248] as [number, number, number] };
const FILTER_BG = { hex: "FDF6E3", rgb: [253, 246, 227] as [number, number, number] };
const LINE = { hex: "D5DDE4", rgb: [213, 221, 228] as [number, number, number] };
const MUTED = { hex: "5C6B76", rgb: [92, 107, 118] as [number, number, number] };

async function exportExcel(props: Props) {
  const { filename, title, filters } = props;
  const sections = toSections(props);
  const single = !props.sections;
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Nexus";
  book.created = new Date();
  const sheetName =
    title.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) ||
    "Report";
  const cols = Math.max(1, ...sections.map((s) => s.headers.length));
  const firstHeaderRowNo = 5;
  const sheet = book.addWorksheet(sheetName, {
    views: single ? [{ state: "frozen", ySplit: firstHeaderRowNo }] : [],
    pageSetup: {
      orientation: cols > 5 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      ...(single ? { printTitlesRow: `${firstHeaderRowNo}:${firstHeaderRowNo}` } : {}),
    },
  });

  sheet.columns = Array.from({ length: cols }, (_, i) => ({
    key: `c${i}`,
    width: Math.min(
      50,
      Math.max(
        10,
        ...sections
          .filter((s) => i < s.headers.length)
          .flatMap((s) => [
            s.headers[i].length + 2,
            ...s.rows.map((r) => cellTextWidth(r[i])),
          ])
      )
    ),
  }));

  const band = (rowNo: number, text: string) => {
    const row = sheet.getRow(rowNo);
    row.getCell(1).value = text;
    if (cols > 1) sheet.mergeCells(rowNo, 1, rowNo, cols);
    return row;
  };

  const titleRow = band(1, title);
  titleRow.height = 30;
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${STEEL.hex}` },
  };
  titleRow.getCell(1).alignment = { vertical: "middle", indent: 1 };
  titleRow.getCell(1).border = {
    bottom: { style: "thick", color: { argb: `FF${ACCENT.hex}` } },
  };

  const filterRow = band(2, `Filters: ${filters}`);
  filterRow.height = Math.min(60, 18 * Math.ceil(filters.length / 140));
  filterRow.getCell(1).font = { size: 10, color: { argb: `FF${STEEL.hex}` } };
  filterRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: `FF${FILTER_BG.hex}` },
  };
  filterRow.getCell(1).alignment = { vertical: "middle", wrapText: true, indent: 1 };

  const metaRow = band(3, exportedLine(single ? sections[0].rows.length : undefined));
  metaRow.getCell(1).font = { italic: true, size: 9, color: { argb: `FF${MUTED.hex}` } };
  metaRow.getCell(1).alignment = { indent: 1 };

  const border = {
    top: { style: "thin" as const, color: { argb: `FF${LINE.hex}` } },
    left: { style: "thin" as const, color: { argb: `FF${LINE.hex}` } },
    bottom: { style: "thin" as const, color: { argb: `FF${LINE.hex}` } },
    right: { style: "thin" as const, color: { argb: `FF${LINE.hex}` } },
  };

  let rowNo = firstHeaderRowNo;
  for (const section of sections) {
    const { headers, rows } = section;
    const numeric = numericColumns(headers, rows);
    const integerCol = headers.map((_, i) =>
      rows.every((r) => typeof r[i] !== "number" || Number.isInteger(r[i]))
    );

    if (section.heading) {
      const headingRow = band(rowNo++, section.heading);
      headingRow.height = 22;
      headingRow.getCell(1).font = { bold: true, size: 12, color: { argb: `FF${STEEL.hex}` } };
      headingRow.getCell(1).alignment = { vertical: "bottom" };
      headingRow.getCell(1).border = {
        bottom: { style: "medium", color: { argb: `FF${ACCENT.hex}` } },
      };
    }
    if (section.note) {
      const noteRow = band(rowNo++, section.note);
      noteRow.height = Math.min(60, 15 * Math.ceil(section.note.length / 160));
      noteRow.getCell(1).font = { italic: true, size: 9, color: { argb: `FF${MUTED.hex}` } };
      noteRow.getCell(1).alignment = { vertical: "top", wrapText: true };
    }

    const headerRowNo = rowNo++;
    const headRow = sheet.getRow(headerRowNo);
    headers.forEach((h, i) => {
      const cell = headRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER.hex}` } };
      cell.alignment = {
        vertical: "middle",
        horizontal: numeric[i] ? "right" : "left",
        wrapText: true,
      };
      cell.border = border;
    });
    headRow.height = 22;

    if (rows.length === 0 && section.emptyMessage) {
      const emptyRow = sheet.getRow(rowNo);
      emptyRow.getCell(1).value = section.emptyMessage;
      if (headers.length > 1) sheet.mergeCells(rowNo, 1, rowNo, headers.length);
      emptyRow.getCell(1).font = { italic: true, size: 10, color: { argb: `FF${MUTED.hex}` } };
      emptyRow.getCell(1).alignment = { horizontal: "center" };
      emptyRow.getCell(1).border = border;
      rowNo++;
    }

    rows.forEach((r, ri) => {
      const row = sheet.getRow(rowNo++);
      const striped = ri % 2 === 1;
      headers.forEach((_, i) => {
        const cell = row.getCell(i + 1);
        const v = r[i];
        cell.value = v == null ? "" : typeof v === "number" && !Number.isFinite(v) ? "" : v;
        cell.font = { size: 10, color: { argb: "FF14232E" } };
        cell.border = border;
        cell.alignment = {
          vertical: "top",
          horizontal: numeric[i] ? "right" : "left",
          wrapText: true,
        };
        if (typeof v === "number") cell.numFmt = integerCol[i] ? "#,##0" : "#,##0.00";
        if (striped) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${STRIPE.hex}` } };
        }
      });
      if (isTotalRow(r)) {
        row.eachCell((cell) => {
          cell.font = { bold: true, size: 10, color: { argb: `FF${STEEL.hex}` } };
          cell.border = { ...border, top: { style: "medium", color: { argb: `FF${STEEL.hex}` } } };
        });
      }
      const lines = rowLineCount(r);
      if (lines > 1) row.height = 16 * lines;
    });

    // Excel allows a single autofilter per sheet.
    if (single && rows.length > 0 && headers.length > 0) {
      sheet.autoFilter = {
        from: { row: headerRowNo, column: 1 },
        to: { row: headerRowNo + rows.length, column: headers.length },
      };
    }
    rowNo++;
  }

  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(filename)}-${stamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pdfNumber = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** jsPDF's built-in fonts are WinAnsi only — swap glyphs they can't draw. */
function pdfText(v: ReportExportCell): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? pdfNumber.format(v) : "";
  return v
    .replace(/₹\s?/g, "Rs. ")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\n]/g, "");
}

async function exportPdf(props: Props) {
  const { filename, title, filters } = props;
  const sections = toSections(props);
  const single = !props.sections;
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const cols = Math.max(1, ...sections.map((s) => s.headers.length));
  const doc = new jsPDF({
    orientation: cols > 5 ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const bottomMargin = 32;
  const textW = pageW - margin * 2;

  doc.setFillColor(...STEEL.rgb);
  doc.rect(0, 0, pageW, 56, "F");
  doc.setFillColor(...ACCENT.rgb);
  doc.rect(0, 56, pageW, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(pdfText(title), textW) as string[];
  doc.text(titleLines[0] ?? "", margin, 35);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const filterLines = doc.splitTextToSize(
    `Filters: ${pdfText(filters)}`,
    textW - 16
  ) as string[];
  const filterH = filterLines.length * 11 + 10;
  doc.setFillColor(...FILTER_BG.rgb);
  doc.setDrawColor(...ACCENT.rgb);
  doc.roundedRect(margin, 70, textW, filterH, 3, 3, "FD");
  doc.setTextColor(...STEEL.rgb);
  doc.text(filterLines, margin + 8, 82);

  const metaY = 70 + filterH + 14;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED.rgb);
  doc.text(
    pdfText(exportedLine(single ? sections[0].rows.length : undefined)),
    margin,
    metaY
  );

  let y = metaY + 8;
  sections.forEach((section, si) => {
    const { headers, rows } = section;
    const numeric = numericColumns(headers, rows);
    const totalRowIdx = rows.findIndex(isTotalRow);

    if (section.heading) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      const noteLines = section.note
        ? (doc.splitTextToSize(pdfText(section.note), textW) as string[])
        : [];
      const blockH = 24 + noteLines.length * 9 + 40;
      if (y + blockH > pageH - bottomMargin) {
        doc.addPage();
        y = margin;
      }
      y += si === 0 ? 10 : 18;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...STEEL.rgb);
      doc.text(pdfText(section.heading), margin, y);
      doc.setDrawColor(...ACCENT.rgb);
      doc.setLineWidth(1);
      doc.line(margin, y + 4, margin + textW, y + 4);
      y += 8;
      if (noteLines.length) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED.rgb);
        doc.text(noteLines, margin, y + 8);
        y += noteLines.length * 9 + 4;
      }
    }

    const body =
      rows.length === 0 && section.emptyMessage
        ? [
            [
              {
                content: pdfText(section.emptyMessage),
                colSpan: Math.max(1, headers.length),
                styles: {
                  halign: "center" as const,
                  fontStyle: "italic" as const,
                  textColor: MUTED.rgb,
                },
              },
            ],
          ]
        : rows.map((r) => headers.map((_, i) => pdfText(r[i])));

    autoTable(doc, {
      startY: y,
      head: [headers.map(pdfText)],
      body,
      theme: "grid",
      margin: { left: margin, right: margin, top: margin, bottom: bottomMargin },
      styles: {
        font: "helvetica",
        fontSize: 7.5,
        cellPadding: 4,
        overflow: "linebreak",
        lineColor: LINE.rgb,
        lineWidth: 0.4,
        textColor: [20, 35, 46],
        valign: "top",
      },
      headStyles: {
        fillColor: HEADER.rgb,
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        valign: "middle",
        lineColor: HEADER.rgb,
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: STRIPE.rgb },
      columnStyles: Object.fromEntries(
        numeric
          .map((n, i) => [i, n] as const)
          .filter(([, n]) => n)
          .map(([i]) => [i, { halign: "right" as const }])
      ),
      didParseCell(hook) {
        if (hook.section === "head" && numeric[hook.column.index]) {
          hook.cell.styles.halign = "right";
        }
        if (hook.section === "body" && hook.row.index === totalRowIdx) {
          hook.cell.styles.fontStyle = "bold";
          hook.cell.styles.fillColor = [226, 232, 238];
          hook.cell.styles.textColor = STEEL.rgb;
        }
      },
    });
    const last = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable;
    y = (last?.finalY ?? y) + 6;
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED.rgb);
    doc.text(pdfText(title), margin, pageH - 16);
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 16, {
      align: "right",
    });
  }
  doc.save(`${safeName(filename)}-${stamp()}.pdf`);
}

/**
 * PDF + Excel download icons for a report. Pass the rows exactly as filtered
 * on screen so the export matches what the user sees; pass `sections` to put
 * several tables (e.g. a whole detail page) into one file.
 */
export function ReportExportIcons(props: Props) {
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const empty = toSections(props).every((s) => s.rows.length === 0);

  async function run(kind: "pdf" | "xlsx") {
    setBusy(kind);
    try {
      if (kind === "pdf") await exportPdf(props);
      else await exportExcel(props);
    } catch (err) {
      console.error(err);
      window.alert("Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("mt-2 flex shrink-0 justify-end gap-1.5", props.className)}>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Export to PDF"
        title={empty ? "No rows to export" : "Export to PDF"}
        disabled={empty || busy !== null}
        onClick={() => void run("pdf")}
      >
        <FileText className="size-3.5 text-red-700" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="outline"
        aria-label="Export to Excel"
        title={empty ? "No rows to export" : "Export to Excel"}
        disabled={empty || busy !== null}
        onClick={() => void run("xlsx")}
      >
        <FileSpreadsheet className="size-3.5 text-emerald-700" aria-hidden />
      </Button>
    </div>
  );
}
