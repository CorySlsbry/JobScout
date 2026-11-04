// Markdown utilities used by the resume tailor + cover letter modals.

import { marked } from "marked";

// Render markdown → HTML. We disable raw HTML pass-through so Claude can't
// inject <script> etc. The styles are applied via the .md-output class
// in globals.css for predictable look in the modal.
export function renderMarkdown(md: string): string {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
  // marked v12+: parse() returns string synchronously when async is false (default)
  return marked.parse(md, { async: false }) as string;
}

// Strip markdown to clean plain text — for "Copy as plain text" → ATS uploads.
// Most ATS parsers ignore # and * but a few choke on them; safer to strip.
export function markdownToPlainText(md: string): string {
  return md
    // headings: "# Title" / "## Section" → "Title"
    .replace(/^#{1,6}\s+/gm, "")
    // bold/italic: **bold** / *italic* / __bold__ / _italic_ → plain
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    // inline code: `code` → code
    .replace(/`([^`]+)`/g, "$1")
    // links: [text](url) → "text (url)"
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    // unordered list markers: "- item" / "* item" / "+ item" → "• item"
    .replace(/^[\s]*[-*+]\s+/gm, "• ")
    // ordered list markers: "1. item" → "1. item" (keep)
    // horizontal rules: "---" / "***" → blank line
    .replace(/^[\s]*[-*_]{3,}[\s]*$/gm, "")
    // blockquotes: "> quote" → "quote"
    .replace(/^>\s+/gm, "")
    // collapse 3+ newlines to 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
