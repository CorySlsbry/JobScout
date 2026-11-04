// Direct PDF download — generates a real .pdf file from markdown, ATS-friendly
// (selectable text, not an image), no print dialog. jsPDF is dynamically
// imported so the ~250KB lib only loads when the user clicks Download .pdf.
//
// Layout matches our DOCX exporter: Helvetica body, violet H2 section bars,
// hyphen bullets, italic dates, hairline horizontal rule under contact line.

export async function markdownToPdfBlob(md: string, filename: string): Promise<{ blob: Blob; filename: string }> {
  const { jsPDF } = await import("jspdf");

  // 8.5 x 11in @ 72pt/in = 612 x 792pt. 0.6in margins.
  const MARGIN = 43.2;          // 0.6in
  const PAGE_W = 612;
  const PAGE_H = 792;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "normal");

  let y = MARGIN;

  const ACCENT_HEX = [168, 85, 247];   // violet
  const MUTED_HEX = [85, 85, 85];
  const FG_HEX = [17, 17, 17];

  function ensureSpace(needed: number) {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // Wrap a single line of text into runs that fit CONTENT_W at the current font.
  function writeWrappedText(text: string, opts: { size: number; bold?: boolean; italic?: boolean; color?: [number, number, number]; lineHeight?: number; indent?: number; bullet?: boolean }) {
    const { size, bold = false, italic = false, color = FG_HEX, lineHeight = 1.35, indent = 0, bullet = false } = opts;
    doc.setFontSize(size);
    doc.setFont("helvetica", bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal");
    doc.setTextColor(color[0], color[1], color[2]);

    const lineH = size * lineHeight;
    const availW = CONTENT_W - indent - (bullet ? 10 : 0);
    const lines: string[] = doc.splitTextToSize(text, availW);
    for (let i = 0; i < lines.length; i++) {
      ensureSpace(lineH);
      let x = MARGIN + indent;
      if (bullet && i === 0) {
        doc.setTextColor(234, 88, 12); // accent orange
        doc.text("•", x, y);
        x += 10;
        doc.setTextColor(color[0], color[1], color[2]);
      } else if (bullet) {
        x += 10;
      }
      doc.text(lines[i], x, y);
      y += lineH;
    }
  }

  // Render inline-styled text (handles **bold** and *italic*).
  function writeInline(text: string, baseOpts: Parameters<typeof writeWrappedText>[1]) {
    // jsPDF doesn't natively mix styles in a single text() call. For a
    // resume, the only inline emphasis we care about is "**Bold:** rest"
    // patterns in the Skills section. Render bold prefix as separate
    // chunk on the same baseline.
    const boldMatch = text.match(/^\*\*([^*]+)\*\*\s*/);
    if (boldMatch) {
      // Single-line layout: render bold prefix, then regular tail on same line
      // by computing the width of the bold prefix and offsetting the tail.
      const prefix = boldMatch[1] + " ";
      const tail = text.slice(boldMatch[0].length);
      const size = baseOpts.size;
      const lineH = size * (baseOpts.lineHeight ?? 1.35);
      ensureSpace(lineH);

      doc.setFontSize(size);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...((baseOpts.color ?? FG_HEX) as [number, number, number]));
      doc.text(prefix, MARGIN + (baseOpts.indent ?? 0), y);
      const prefixW = doc.getTextWidth(prefix);

      doc.setFont("helvetica", "normal");
      const tailLines = doc.splitTextToSize(tail, CONTENT_W - (baseOpts.indent ?? 0) - prefixW);
      doc.text(tailLines[0] ?? "", MARGIN + (baseOpts.indent ?? 0) + prefixW, y);
      y += lineH;
      // If tail wrapped, render rest on subsequent lines
      for (let i = 1; i < tailLines.length; i++) {
        ensureSpace(lineH);
        doc.text(tailLines[i], MARGIN + (baseOpts.indent ?? 0), y);
        y += lineH;
      }
      return;
    }
    // No inline styles: just write the whole thing
    writeWrappedText(text, baseOpts);
  }

  function drawHorizontalRule(color: [number, number, number] = [200, 200, 210], thickness = 0.5) {
    ensureSpace(8);
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(thickness);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 8;
  }

  // ─── Parse markdown line by line ─────────────────────────────────
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      y += 4;
      continue;
    }
    // # Name (page title)
    if (/^#\s+(.+)$/.test(t)) {
      const text = t.replace(/^#\s+/, "").replace(/\*\*/g, "");
      ensureSpace(36);
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(FG_HEX[0], FG_HEX[1], FG_HEX[2]);
      doc.text(text, MARGIN, y + 18);
      y += 28;
      continue;
    }
    // ## Section header (violet uppercase + rule)
    if (/^##\s+(.+)$/.test(t)) {
      const text = t.replace(/^##\s+/, "").toUpperCase();
      y += 6;
      ensureSpace(20);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(ACCENT_HEX[0], ACCENT_HEX[1], ACCENT_HEX[2]);
      doc.text(text, MARGIN, y);
      y += 4;
      drawHorizontalRule([ACCENT_HEX[0], ACCENT_HEX[1], ACCENT_HEX[2]], 0.7);
      y += 2;
      continue;
    }
    // ### Role — Company
    if (/^###\s+(.+)$/.test(t)) {
      const text = t.replace(/^###\s+/, "").replace(/\*\*/g, "");
      y += 4;
      writeWrappedText(text, { size: 12, bold: true });
      continue;
    }
    // *italic dates*
    if (/^\*[^*]+\*$/.test(t)) {
      const text = t.replace(/^\*|\*$/g, "");
      writeWrappedText(text, { size: 10, italic: true, color: MUTED_HEX as [number, number, number] });
      continue;
    }
    // --- horizontal rule
    if (/^-{3,}$/.test(t)) {
      drawHorizontalRule();
      continue;
    }
    // - bullet
    if (/^[-*]\s+(.+)$/.test(t)) {
      const text = t.replace(/^[-*]\s+/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")   // strip bold markers; PDF inline is hard
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
      writeWrappedText(text, { size: 11, bullet: true });
      continue;
    }
    // Default body paragraph (may have **Bold:** prefix for Skills lines)
    if (/^\*\*[^*]+\*\*/.test(t)) {
      writeInline(t.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1"), { size: 11 });
      continue;
    }
    writeWrappedText(t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1"),
      { size: 11 });
  }

  doc.setProperties({
    title: filename.replace(/\.pdf$/i, ""),
    creator: "JobScout",
    subject: "Resume",
  });
  const blob = doc.output("blob");
  return { blob, filename };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
