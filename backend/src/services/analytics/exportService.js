import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * exportService
 *
 * Converts a dashboard payload into downloadable artifacts: JSON, CSV,
 * Excel (.xlsx) and a summary PDF.
 */

function flattenOverview(payload) {
  const o = payload.overview || {};
  return Object.entries(o).map(([metric, value]) => ({ metric, value }));
}

function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export function buildJson(payload) {
  return {
    contentType: "application/json",
    extension: "json",
    body: Buffer.from(JSON.stringify(payload, null, 2), "utf8")
  };
}

export function buildCsv(payload) {
  const sections = [];
  sections.push("# Overview");
  sections.push(rowsToCsv(flattenOverview(payload)));
  if (payload.dailyVisitors?.length) {
    sections.push("\n# Daily");
    sections.push(rowsToCsv(payload.dailyVisitors));
  }
  if (payload.trafficSources?.topSources?.length) {
    sections.push("\n# Traffic Sources");
    sections.push(rowsToCsv(payload.trafficSources.topSources));
  }
  if (payload.countries?.length) {
    sections.push("\n# Countries");
    sections.push(rowsToCsv(payload.countries));
  }
  if (payload.topEvents?.length) {
    sections.push("\n# Events");
    sections.push(rowsToCsv(payload.topEvents));
  }
  return {
    contentType: "text/csv",
    extension: "csv",
    body: Buffer.from(sections.join("\n"), "utf8")
  };
}

export async function buildExcel(payload) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OTODIAL Analytics";
  wb.created = new Date();

  const addSheet = (name, rows) => {
    if (!rows || rows.length === 0) return;
    const ws = wb.addWorksheet(name);
    const headers = Object.keys(rows[0]);
    ws.columns = headers.map((h) => ({ header: h, key: h, width: 22 }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
  };

  addSheet("Overview", flattenOverview(payload));
  addSheet("Daily", payload.dailyVisitors);
  addSheet("Traffic Sources", payload.trafficSources?.topSources);
  addSheet("Channels", payload.trafficSources?.channels);
  addSheet("Countries", payload.countries);
  addSheet("Devices", payload.devices);
  addSheet("Browsers", payload.browsers);
  addSheet("Pages", payload.pages);
  addSheet("Events", payload.topEvents);
  if (payload.revenue?.byDay) addSheet("Revenue", payload.revenue.byDay);

  const body = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    body
  };
}

export function buildPdf(payload) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () =>
        resolve({
          contentType: "application/pdf",
          extension: "pdf",
          body: Buffer.concat(chunks)
        })
      );

      const o = payload.overview || {};
      const range = payload.meta?.range || {};

      doc.fontSize(20).text("OTODIAL Analytics Report", { align: "left" });
      doc.moveDown(0.3);
      doc
        .fontSize(10)
        .fillColor("#666")
        .text(
          `Range: ${range.label || ""}  (${(range.startDate || "").slice(0, 10)} - ${(range.endDate || "").slice(0, 10)})`
        );
      doc.text(`Generated: ${new Date().toLocaleString()}`);
      doc.moveDown(1);
      doc.fillColor("#000");

      const kpis = [
        ["Unique Visitors", o.uniqueVisitors],
        ["New Visitors", o.newVisitors],
        ["Returning Visitors", o.returningVisitors],
        ["Sessions", o.sessions],
        ["Page Views", o.pageViews],
        ["Bounce Rate", `${o.bounceRate ?? 0}%`],
        ["Avg Session Duration", `${o.avgSessionDuration ?? 0}s`],
        ["Sign-ups", o.signUps],
        ["Subscriptions", o.usersWithSubscription],
        ["Revenue", `$${o.revenue ?? 0}`],
        ["ARPU", `$${o.arpu ?? 0}`],
        ["Signup Conv.", `${o.signupConversionRate ?? 0}%`]
      ];

      doc.fontSize(14).text("Executive Summary", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11);
      kpis.forEach(([label, value]) => {
        doc.text(`${label}: `, { continued: true }).font("Helvetica-Bold").text(String(value ?? 0));
        doc.font("Helvetica");
      });

      if (payload.trafficSources?.topSources?.length) {
        doc.moveDown(1);
        doc.fontSize(14).text("Top Traffic Sources", { underline: true });
        doc.moveDown(0.3).fontSize(10);
        payload.trafficSources.topSources.slice(0, 10).forEach((s) => {
          doc.text(`${s.source} (${s.channel}) — ${s.visits} visits, ${s.signUps} signups`);
        });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export async function buildExport(payload, format) {
  switch (String(format || "json").toLowerCase()) {
    case "csv":
      return buildCsv(payload);
    case "excel":
    case "xlsx":
      return buildExcel(payload);
    case "pdf":
      return buildPdf(payload);
    case "json":
    default:
      return buildJson(payload);
  }
}

export default { buildExport, buildJson, buildCsv, buildExcel, buildPdf };
