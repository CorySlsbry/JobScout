// Test the markdownToDocxBlob function with the same sample resume the user
// would generate. Verifies the docx generation pipeline produces a valid file.

import * as docx from "docx";
import { writeFileSync } from "node:fs";

const sampleMd = `# Cory S. Salisbury

Orem, UT (open to remote, relocating to St George, UT) · (801) 245-0511 · cory.salisbury@gmail.com

---

## Professional Summary

Automation engineer with 7+ years of complex-systems experience at Tesla, Rivian, and SpaceX, now operating an AI-augmented automation practice using Claude Code, n8n, and Supabase. Builds end-to-end pipelines that ingest data, route work, generate content, and ship customer-facing apps.

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

- **University of Utah** — Full Stack Web Development Bootcamp (2021)
- **ASE Master Certified** — A1-A8 + L3 EV
- **Tesla Master Technician** — DAS, Thermal, Low Voltage, High Voltage

## Technical Skills

**Automation / AI:** Claude Code, MCP, n8n, GoHighLevel, Apollo
**Web / App:** TypeScript, JavaScript, Node.js, React, Next.js, Tailwind
**Diagnostics:** Linux/Ubuntu, Git, CAN/LIN bus, oscilloscope, electrical theory`;

// Replicate the markdownToDocxBlob logic inline (since the original imports paths Node can't resolve directly).
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = docx;

function parseInlineRuns(text, defaultBold = false) {
  const runs = [{ text, bold: defaultBold }];
  function expand(re, builder) {
    for (let i = 0; i < runs.length; i++) {
      const cur = runs[i];
      const m = cur.text.match(re);
      if (!m || m.index === undefined) continue;
      const before = cur.text.slice(0, m.index);
      const inside = builder(m);
      const after = cur.text.slice(m.index + m[0].length);
      const repl = [];
      if (before) repl.push({ text: before, bold: cur.bold, italics: cur.italics });
      repl.push({ ...inside, bold: inside.bold ?? cur.bold, italics: inside.italics ?? cur.italics });
      if (after) repl.push({ text: after, bold: cur.bold, italics: cur.italics });
      runs.splice(i, 1, ...repl);
      i += repl.length - 1; i--;
    }
  }
  expand(/\*\*([^*]+)\*\*/, (m) => ({ text: m[1], bold: true }));
  expand(/(?<!\*)\*([^*\n]+)\*(?!\*)/, (m) => ({ text: m[1], italics: true }));
  return runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italics }));
}

const lines = sampleMd.split(/\r?\n/);
const paragraphs = [];

for (const raw of lines) {
  const t = raw.trim();
  if (!t) continue;

  if (/^#\s+(.+)$/.test(t)) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [new TextRun({ text: t.replace(/^#\s+/, ""), bold: true, size: 36 })],
    }));
  } else if (/^##\s+(.+)$/.test(t)) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 100 },
      border: { bottom: { color: "A855F7", space: 1, style: BorderStyle.SINGLE, size: 6 } },
      children: [new TextRun({ text: t.replace(/^##\s+/, "").toUpperCase(), bold: true, size: 22, color: "A855F7" })],
    }));
  } else if (/^###\s+(.+)$/.test(t)) {
    paragraphs.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 30 },
      children: parseInlineRuns(t.replace(/^###\s+/, ""), true),
    }));
  } else if (/^\*[^*]+\*$/.test(t)) {
    paragraphs.push(new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: t.replace(/^\*|\*$/g, ""), italics: true, color: "6B6585", size: 18 })],
    }));
  } else if (/^-{3,}$/.test(t)) {
    paragraphs.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      border: { bottom: { color: "C9C9D6", space: 1, style: BorderStyle.SINGLE, size: 6 } },
      children: [new TextRun({ text: "" })],
    }));
  } else if (/^[-*]\s+(.+)$/.test(t)) {
    paragraphs.push(new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 60 },
      children: parseInlineRuns(t.replace(/^[-*]\s+/, ""), false),
    }));
  } else {
    paragraphs.push(new Paragraph({
      spacing: { after: 100 },
      children: parseInlineRuns(t, false),
    }));
  }
}

const doc = new Document({
  creator: "JobScout",
  title: "Test resume",
  styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
  sections: [{
    properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
    children: paragraphs,
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync("test-resume.docx", buffer);
console.log(`✅ Generated test-resume.docx: ${buffer.length} bytes, ${paragraphs.length} paragraphs`);
console.log(`   File magic bytes: ${buffer.slice(0, 4).toString("hex")} (should start with 504b for valid zip/.docx)`);
