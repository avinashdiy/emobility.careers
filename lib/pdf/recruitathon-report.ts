import PDFDocument from "pdfkit";

/**
 * Renders a candidate's Bharat eMobility Recruitathon test report to a PDF
 * buffer using pdfkit. Unlike the ATS-plain resume PDF, this is a branded,
 * candidate-facing certificate-style report: green header band, an overall
 * summary, the mandatory General EV score, and a card per role assessment
 * (company · role, AI match %, test score, pass/fail).
 */

export type AttemptStatus = "done" | "in_progress" | "not_started";

export interface ReportResult {
  score: number | null; // percent, or null if not taken
  passed: boolean | null;
  status: AttemptStatus;
  passMark: number;
}

export interface ReportJd extends ReportResult {
  company: string;
  role: string;
  level: string;
  matchScore: number | null; // AI fitment 0-100
}

export interface RecruitathonReportData {
  name: string;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  general: ReportResult | null; // null if the General EV test isn't configured
  jds: ReportJd[];
  generatedAt: Date;
}

const GREEN = "#14532d";
const MINT = "#dcfce7";
const MINT_TEXT = "#166534";
const DARK = "#1f2937";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";
const AMBER_BG = "#fef3c7";
const AMBER_TEXT = "#92400e";
const SLATE_BG = "#f1f5f9";
const SLATE_TEXT = "#475569";

export async function renderRecruitathonReportPdf(d: RecruitathonReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `${d.name} — Recruitathon Test Report`,
        Author: "eMobility Careers · DIYguru Mobility",
        Subject: "Bharat eMobility Recruitathon 2026 — Candidate Test Report",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 48;
    const CW = W - M * 2;

    // ── Header band ─────────────────────────────────────────────
    doc.rect(0, 0, W, 104).fill(GREEN);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(19).text("Bharat eMobility Recruitathon 2026", M, 30, { width: CW });
    doc.fillColor("#a7f3d0").font("Helvetica-Bold").fontSize(9.5).text("CANDIDATE TEST REPORT  ·  POWERED BY DIYGURU MOBILITY", M, 58, { characterSpacing: 1 });

    // ── Candidate identity ──────────────────────────────────────
    let y = 128;
    doc.fillColor(DARK).font("Helvetica-Bold").fontSize(21).text(d.name || "Candidate", M, y, { width: CW });
    y = doc.y + 1;
    if (d.headline) {
      doc.font("Helvetica").fontSize(11).fillColor(MUTED).text(d.headline, M, y, { width: CW });
      y = doc.y;
    }
    const contact = [d.email, d.phone, d.location].filter(Boolean).join("   ·   ");
    if (contact) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(contact, M, y + 3, { width: CW });
      y = doc.y;
    }

    // ── Summary strip ───────────────────────────────────────────
    y += 18;
    const takenJd = d.jds.filter((j) => j.status === "done");
    const scored = [
      ...(d.general?.status === "done" && d.general.score != null ? [d.general.score] : []),
      ...takenJd.filter((j) => j.score != null).map((j) => j.score as number),
    ];
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
    const totalRole = d.jds.length;
    doc.roundedRect(M, y, CW, 52, 8).fill(SLATE_BG);
    const cellW = CW / 3;
    summaryCell(doc, M, y, cellW, "General EV", d.general ? statusLabel(d.general) : "—");
    summaryCell(doc, M + cellW, y, cellW, "Role tests done", `${takenJd.length} / ${totalRole}`);
    summaryCell(doc, M + cellW * 2, y, cellW, "Average score", avg != null ? `${avg}%` : "—");
    y += 52 + 22;

    // ── General EV result ───────────────────────────────────────
    if (d.general) {
      sectionHeading(doc, "General EV Knowledge Test", M, y, CW);
      y = doc.y + 8;
      y = drawResultCard(doc, M, y, CW, { title: "General EV Knowledge Test", subtitle: "Mandatory qualifier · unlocks role tests", match: null, res: d.general });
      y += 18;
    }

    // ── Role assessments ────────────────────────────────────────
    sectionHeading(doc, "Role Assessments", M, y, CW);
    y = doc.y + 8;
    if (d.jds.length === 0) {
      doc.font("Helvetica-Oblique").fontSize(10).fillColor(MUTED).text("No role tests selected yet.", M, y);
      y = doc.y;
    }
    for (const jd of d.jds) {
      if (y > H - 96) { doc.addPage(); y = M; }
      y = drawResultCard(doc, M, y, CW, {
        title: jd.role,
        subtitle: `${jd.company}  ·  ${levelLabel(jd.level)}`,
        match: jd.matchScore,
        res: jd,
      });
      y += 10;
    }

    // ── Footer ──────────────────────────────────────────────────
    if (y > H - 70) { doc.addPage(); y = M; }
    y = Math.max(y, H - 64);
    doc.strokeColor(BORDER).lineWidth(0.75).moveTo(M, y).lineTo(W - M, y).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      `Generated ${d.generatedAt.toLocaleDateString("en-IN", { dateStyle: "long" })}  ·  emobility.careers  ·  Scores are shared with participating hiring companies for shortlisting.`,
      M, y + 8, { width: CW, align: "center" },
    );

    doc.end();
  });
}

// ── helpers ───────────────────────────────────────────────────
function levelLabel(level: string): string {
  return level === "BASIC" ? "ITI / Diploma" : level === "ADVANCED" ? "Graduate / Experienced" : "Diploma / Graduate";
}
function statusLabel(r: ReportResult): string {
  if (r.status === "done") return r.score != null ? `${r.score}%` : "Done";
  if (r.status === "in_progress") return "In progress";
  return "Not taken";
}

function summaryCell(doc: PDFKit.PDFDocument, x: number, y: number, w: number, label: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(SLATE_TEXT).text(label.toUpperCase(), x, y + 11, { width: w, align: "center", characterSpacing: 0.5 });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(DARK).text(value, x, y + 24, { width: w, align: "center" });
}

function sectionHeading(doc: PDFKit.PDFDocument, title: string, x: number, y: number, w: number) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN).text(title.toUpperCase(), x, y, { width: w, characterSpacing: 1 });
}

/** Draws a bordered card with title/subtitle on the left, an optional match
 *  chip, and a right-aligned score + result pill. Returns the y below it. */
function drawResultCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  opts: { title: string; subtitle: string; match: number | null; res: ReportResult },
): number {
  const h = 62;
  doc.roundedRect(x, y, w, h, 8).lineWidth(1).fillAndStroke("#ffffff", BORDER);

  const padX = 16;
  // Left: title + subtitle (+ match chip)
  doc.font("Helvetica-Bold").fontSize(12).fillColor(DARK).text(opts.title, x + padX, y + 12, { width: w - 170, ellipsis: true, lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(opts.subtitle, x + padX, y + 30, { width: w - 170, ellipsis: true, lineBreak: false });
  if (opts.match != null) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MINT_TEXT).text(`AI match: ${opts.match}%`, x + padX, y + 44);
  }

  // Right: score + result pill
  const rightW = 130;
  const rx = x + w - rightW - padX;
  const res = opts.res;
  if (res.status === "done") {
    doc.font("Helvetica-Bold").fontSize(22).fillColor(DARK).text(res.score != null ? `${res.score}%` : "—", rx, y + 12, { width: rightW, align: "right" });
    pill(doc, rx, y + 40, rightW, res.passed ? "PASSED" : `PASS MARK ${res.passMark}%`, res.passed ? MINT : AMBER_BG, res.passed ? MINT_TEXT : AMBER_TEXT);
  } else {
    const label = res.status === "in_progress" ? "IN PROGRESS" : "NOT TAKEN";
    doc.font("Helvetica-Bold").fontSize(11).fillColor(MUTED).text(label === "IN PROGRESS" ? "—" : "—", rx, y + 16, { width: rightW, align: "right" });
    pill(doc, rx, y + 40, rightW, label, SLATE_BG, SLATE_TEXT);
  }
  return y + h;
}

/** Right-aligned status pill. Width `w` is the right column; the pill hugs
 *  the right edge and is sized to its text. */
function pill(doc: PDFKit.PDFDocument, x: number, y: number, w: number, text: string, bg: string, fg: string) {
  doc.font("Helvetica-Bold").fontSize(7.5);
  const tw = doc.widthOfString(text, { characterSpacing: 0.5 });
  const pad = 8;
  const pw = tw + pad * 2;
  const px = x + w - pw; // right-align within the column
  doc.roundedRect(px, y, pw, 15, 7.5).fill(bg);
  doc.fillColor(fg).text(text, px, y + 4, { width: pw, align: "center", characterSpacing: 0.5 });
}
