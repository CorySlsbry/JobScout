// Client-only resume parser. Returns markdown for any supported file type.
// Heavy parsers (pdfjs, mammoth) are dynamically imported so they don't
// bloat the initial bundle.

import type { ResumeKind } from "./types";

export type ParseResult = {
  md: string;
  kind: ResumeKind;
};

export const ACCEPT_MIME = ".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function parseResumeFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BYTES) throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 10 MB max)`);

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "md") {
    const md = await file.text();
    return { md, kind: "md" };
  }
  if (ext === "txt") {
    const txt = await file.text();
    return { md: textToMarkdown(txt), kind: "txt" };
  }
  if (ext === "docx") {
    return { md: await parseDocx(file), kind: "docx" };
  }
  if (ext === "pdf") {
    return { md: await parsePdf(file), kind: "pdf" };
  }
  throw new Error(`Unsupported file type: .${ext}. Use PDF, DOCX, MD, or TXT.`);
}

// ─── DOCX ──────────────────────────────────────────────────────
async function parseDocx(file: File): Promise<string> {
  // mammoth.browser.js has no types — import dynamically and cast.
  const mammoth = await import(/* webpackIgnore: false */ "mammoth/mammoth.browser" as string) as unknown as {
    convertToMarkdown: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>;
  };
  const buf = await file.arrayBuffer();
  const result = await mammoth.convertToMarkdown({ arrayBuffer: buf });
  return cleanMarkdown(result.value);
}

// ─── PDF ───────────────────────────────────────────────────────
type PdfTextItem = { str: string; transform: number[] };
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = { getTextContent: () => Promise<{ items: PdfTextItem[] }> };

async function parsePdf(file: File): Promise<string> {
  // Import the legacy build — works in browsers without bundler-specific config.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as {
    getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
    GlobalWorkerOptions: { workerSrc: string };
  };
  // pdfjs needs a worker. Use the CDN-hosted matching version to avoid
  // bundler config — version is read from the package.
  const pkg = await import("pdfjs-dist/package.json") as { version?: string; default?: { version?: string } };
  const ver = pkg.version ?? pkg.default?.version ?? "5.4.149";
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/legacy/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    pages.push(joinPdfItems(text.items));
  }
  return textToMarkdown(pages.join("\n\n"));
}

// PDF text items come ordered top-down, left-right. Group items by approximate
// y-coordinate (transform[5]) into lines.
function joinPdfItems(items: PdfTextItem[]): string {
  if (!items.length) return "";
  const lines: string[][] = [];
  let currentY: number | null = null;
  for (const it of items) {
    const y = it.transform?.[5] ?? 0;
    if (currentY === null || Math.abs(y - currentY) > 2) {
      lines.push([it.str]);
      currentY = y;
    } else {
      lines[lines.length - 1].push(it.str);
    }
  }
  return lines.map((l) => l.join(" ").trim()).filter(Boolean).join("\n");
}

// ─── plain text → markdown heuristics ──────────────────────────
// Tries to recover markdown structure from plain text:
//   * lines that look like section headers (ALL CAPS, short) → ## Section
//   * lines starting with - or • or * → bullet
//   * everything else → paragraph
function textToMarkdown(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let lastWasBlank = true;
  for (let raw of lines) {
    raw = raw.replace(/ /g, " ").replace(/[•●]/g, "-").trimEnd();
    const t = raw.trim();
    if (!t) {
      if (!lastWasBlank) out.push("");
      lastWasBlank = true;
      continue;
    }
    lastWasBlank = false;
    // Section-header heuristic: short ALL-CAPS line, or Title-Case line under 40 chars.
    if (t.length < 60 && /^[A-Z][A-Z0-9 &/\-+]+$/.test(t)) {
      out.push("## " + properCase(t));
      continue;
    }
    // Bulleted lines
    if (/^[-*]\s+/.test(t)) {
      out.push("- " + t.replace(/^[-*]\s+/, ""));
      continue;
    }
    out.push(t);
  }
  return cleanMarkdown(out.join("\n"));
}

function properCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// Tighten generic markdown — collapse triple+ blank lines, trim.
function cleanMarkdown(md: string): string {
  return md.replace(/\n{3,}/g, "\n\n").trim();
}
