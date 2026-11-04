// Markdown → .docx converter for resume / cover letter exports.
// Lazy-imports `docx` so it only ships in the bundle when the user clicks Export.
//
// Resume markdown structure we expect (from Claude's TAILOR_RESUME_SYSTEM):
//   # Name
//   contact line
//   ---
//   ## Section
//   ### Role — Company
//   *YYYY-YYYY*
//   - bullet
//   **Bold:** plain
//
// We translate each construct to native Word styles so ATS parsers see clean
// headings + paragraphs, not styled spans.

export type DocxBlob = Blob;

export async function markdownToDocxBlob(md: string, filename: string): Promise<{ blob: DocxBlob; filename: string }> {
  const docx = await import("docx");
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle,
  } = docx;

  // Inline-run parser: splits text on **bold** and *italic* into docx TextRuns.
  function parseInlineRuns(text: string, defaultBold = false): InstanceType<typeof TextRun>[] {
    const runs: InlineRun[] = [{ text, bold: defaultBold }];
    expandPattern(runs, /\*\*([^*]+)\*\*/, (m) => ({ text: m[1], bold: true }));
    expandPattern(runs, /(?<!\*)\*([^*\n]+)\*(?!\*)/, (m) => ({ text: m[1], italics: true }));
    return runs.map((r) => new TextRun({ text: r.text, bold: r.bold, italics: r.italics }));
  }
  function expandPattern(runs: InlineRun[], re: RegExp, builder: (m: RegExpMatchArray) => InlineRun) {
    for (let i = 0; i < runs.length; i++) {
      const cur = runs[i];
      const m = cur.text.match(re);
      if (!m || m.index === undefined) continue;
      const before = cur.text.slice(0, m.index);
      const inside = builder(m);
      const after = cur.text.slice(m.index + m[0].length);
      const replacement: InlineRun[] = [];
      if (before) replacement.push({ text: before, bold: cur.bold, italics: cur.italics });
      replacement.push({ ...inside, bold: inside.bold ?? cur.bold, italics: inside.italics ?? cur.italics });
      if (after) replacement.push({ text: after, bold: cur.bold, italics: cur.italics });
      runs.splice(i, 1, ...replacement);
      i += replacement.length - 1;
      i--;
    }
  }

  const lines = md.split(/\r?\n/);
  const paragraphs: InstanceType<typeof Paragraph>[] = [];
  let inBulletList = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t) {
      // Blank line — close bullet list, add a small spacer.
      inBulletList = false;
      continue;
    }

    // # Name — display H1
    if (/^#\s+(.+)$/.test(t)) {
      const text = t.replace(/^#\s+/, "");
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
        spacing: { after: 60 },
        children: [new TextRun({ text, bold: true, size: 36 })],
      }));
      continue;
    }
    // ## Section — h1 with violet rule
    if (/^##\s+(.+)$/.test(t)) {
      const text = t.replace(/^##\s+/, "");
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 100 },
        border: { bottom: { color: "A855F7", space: 1, style: BorderStyle.SINGLE, size: 6 } },
        children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: "A855F7", characterSpacing: 30 })],
      }));
      continue;
    }
    // ### Role — Company
    if (/^###\s+(.+)$/.test(t)) {
      const text = t.replace(/^###\s+/, "");
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 180, after: 30 },
        children: parseInlineRuns(text, true),
      }));
      continue;
    }
    // *italic dates*
    if (/^\*[^*]+\*$/.test(t)) {
      const text = t.replace(/^\*|\*$/g, "");
      paragraphs.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text, italics: true, color: "6B6585", size: 18 })],
      }));
      continue;
    }
    // --- horizontal rule
    if (/^-{3,}$/.test(t)) {
      paragraphs.push(new Paragraph({
        spacing: { before: 60, after: 60 },
        border: { bottom: { color: "C9C9D6", space: 1, style: BorderStyle.SINGLE, size: 6 } },
        children: [new TextRun({ text: "" })],
      }));
      continue;
    }
    // - bullet
    if (/^[-*]\s+(.+)$/.test(t)) {
      const text = t.replace(/^[-*]\s+/, "");
      inBulletList = true;
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: parseInlineRuns(text, false),
      }));
      continue;
    }

    // Default — body paragraph
    inBulletList = false;
    paragraphs.push(new Paragraph({
      spacing: { after: 100 },
      children: parseInlineRuns(t, false),
    }));
  }
  void inBulletList;

  const doc = new Document({
    creator: "JobScout",
    title: filename,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } }, // 0.5in
      },
      children: paragraphs,
    }],
  });

  const blob = await Packer.toBlob(doc);
  return { blob, filename };
}

type InlineRun = { text: string; bold?: boolean; italics?: boolean };

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
