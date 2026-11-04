// Smoke test the jsPDF + markdown-to-PDF pipeline locally so we know it
// produces a real selectable-text PDF before deploying.

import { jsPDF } from "jspdf";
import { writeFileSync } from "node:fs";

const sample = `# Cory S. Salisbury

Orem, UT · (801) 245-0511 · cory.salisbury@gmail.com

---

## Professional Summary

Automation engineer with 7+ years of complex-systems experience at Tesla, Rivian, and SpaceX. Builds end-to-end pipelines using Claude Code, n8n, and Supabase.

## Professional Experience

### Sr. Service Technician — Tesla, SLC & Pleasant Grove, UT
*2016-2018 · 2018-2020 · 2022-Present*

- Diagnose complex high-voltage, low-voltage, and CAN/LIN integrations using Tesla internal tools.
- Run virtual / remote diagnosis sessions for field cars; reduced turnaround on hard-to-repro intermittents.
- Built training program in CAN/LIN and software diagnostics that lifted team productivity ~15%.

### Sr. Field Service Technician — Rivian, SLC, UT
*2021-2022*

- Stood up high-voltage diagnostics for R1T launch and Amazon delivery van fleet.

## Education & Certifications

- University of Utah — Full Stack Web Development Bootcamp (2021)
- ASE Master Certified — A1-A8 + L3 EV
- Tesla Master Technician — DAS, Thermal, Low Voltage, High Voltage

## Technical Skills

**Automation / AI:** Claude Code, MCP, n8n, GoHighLevel, Apollo
**Web / App:** TypeScript, JavaScript, Node.js, React, Next.js, Tailwind
**Diagnostics:** Linux/Ubuntu, Git, CAN/LIN bus, oscilloscope, electrical theory`;

// Replicate the markdownToPdfBlob logic inline so we test the actual layout.
const MARGIN = 43.2;
const PAGE_W = 612, PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;
const doc = new jsPDF({ unit: "pt", format: "letter" });
doc.setFont("helvetica", "normal");
let y = MARGIN;

const ACCENT = [168, 85, 247], MUTED = [85, 85, 85], FG = [17, 17, 17];

function ensure(n) { if (y + n > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN; } }

function wrap(text, opts) {
  const { size, bold = false, italic = false, color = FG, lineHeight = 1.35, indent = 0, bullet = false } = opts;
  doc.setFontSize(size);
  doc.setFont("helvetica", bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal");
  doc.setTextColor(color[0], color[1], color[2]);
  const lh = size * lineHeight;
  const availW = CONTENT_W - indent - (bullet ? 10 : 0);
  const lines = doc.splitTextToSize(text, availW);
  for (let i = 0; i < lines.length; i++) {
    ensure(lh);
    let x = MARGIN + indent;
    if (bullet && i === 0) { doc.setTextColor(234, 88, 12); doc.text("•", x, y); x += 10; doc.setTextColor(...color); }
    else if (bullet) x += 10;
    doc.text(lines[i], x, y);
    y += lh;
  }
}
function rule(color = [200, 200, 210], t = 0.5) { ensure(8); doc.setDrawColor(...color); doc.setLineWidth(t); doc.line(MARGIN, y, MARGIN + CONTENT_W, y); y += 8; }

const lines = sample.split(/\r?\n/);
for (const raw of lines) {
  const t = raw.trim();
  if (!t) { y += 4; continue; }
  if (/^#\s+(.+)$/.test(t)) { ensure(36); doc.setFontSize(22); doc.setFont("helvetica", "bold"); doc.setTextColor(...FG); doc.text(t.replace(/^#\s+/, ""), MARGIN, y + 18); y += 28; continue; }
  if (/^##\s+(.+)$/.test(t)) { y += 6; ensure(20); doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...ACCENT); doc.text(t.replace(/^##\s+/, "").toUpperCase(), MARGIN, y); y += 4; rule(ACCENT, 0.7); y += 2; continue; }
  if (/^###\s+(.+)$/.test(t)) { y += 4; wrap(t.replace(/^###\s+/, "").replace(/\*\*/g, ""), { size: 12, bold: true }); continue; }
  if (/^\*[^*]+\*$/.test(t)) { wrap(t.replace(/^\*|\*$/g, ""), { size: 10, italic: true, color: MUTED }); continue; }
  if (/^-{3,}$/.test(t)) { rule(); continue; }
  if (/^[-*]\s+(.+)$/.test(t)) { wrap(t.replace(/^[-*]\s+/, ""), { size: 11, bullet: true }); continue; }
  wrap(t.replace(/\*\*([^*]+)\*\*/g, "$1"), { size: 11 });
}

const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync("test-resume.pdf", buf);
console.log(`✅ Generated test-resume.pdf: ${buf.length} bytes`);
console.log(`   Magic: ${buf.slice(0, 5).toString("ascii")} (should be %PDF-)`);
console.log(`   Pages: ${doc.getNumberOfPages()}`);
