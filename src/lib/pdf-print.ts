// Open a new window with a clean print-friendly version of rendered markdown
// HTML and auto-trigger the browser's print dialog. The user picks "Save as
// PDF" to get a real .pdf file. Zero server dependencies, native rendering
// quality (vector text, perfect kerning), and ATS-friendly (no images, just
// text). Works on every modern browser.

import { renderMarkdown } from "./markdown";

const PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  body {
    font-family: Calibri, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    padding: 0.6in 0.7in;
    max-width: 8.5in;
    margin: 0 auto;
  }
  h1 {
    font-size: 22pt;
    font-weight: 800;
    letter-spacing: -0.01em;
    margin: 0 0 4pt 0;
    color: #111;
  }
  h2 {
    font-size: 11pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #a855f7;
    margin: 14pt 0 4pt 0;
    padding-bottom: 3pt;
    border-bottom: 1pt solid #c9c9d6;
  }
  h3 {
    font-size: 12pt;
    font-weight: 700;
    margin: 10pt 0 2pt 0;
    color: #111;
  }
  h4 { font-size: 11pt; font-weight: 600; margin: 8pt 0 2pt 0; }
  p { margin: 0 0 7pt 0; }
  em { color: #555; font-style: italic; font-size: 10pt; }
  strong { color: #111; font-weight: 700; }
  ul { list-style: none; padding: 0; margin: 3pt 0 9pt 0; }
  ul li {
    padding-left: 14pt;
    position: relative;
    margin: 3pt 0;
    page-break-inside: avoid;
  }
  ul li::before {
    content: "•";
    color: #ea580c;
    position: absolute;
    left: 4pt;
    top: 0;
  }
  ol { padding-left: 18pt; margin: 3pt 0 9pt 0; }
  ol li { margin: 3pt 0; page-break-inside: avoid; }
  hr { border: 0; border-top: 1pt solid #c9c9d6; margin: 10pt 0; }
  a { color: #111; text-decoration: none; }
  code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 10pt;
    background: #f3f3f7;
    padding: 1pt 4pt;
    border-radius: 3pt;
  }
  /* Avoid splitting role blocks across pages */
  h3, h3 + em, h3 + p { page-break-after: avoid; }
  @page { margin: 0; size: letter; }
`;

export function openPrintWindow(markdown: string, jobTitle: string): boolean {
  const w = window.open("", "_blank", "width=800,height=900,noopener");
  if (!w) return false; // popup blocked

  const html = renderMarkdown(markdown);
  const safeTitle = jobTitle.replace(/[<>&"']/g, " ").trim() || "Resume";

  w.document.open();
  w.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>JobScout · ${safeTitle}</title>
    <style>${PRINT_CSS}</style>
  </head>
  <body>
    <article>${html}</article>
    <script>
      // Wait for fonts + layout, then open print dialog. User picks "Save as PDF".
      window.addEventListener('load', function () {
        setTimeout(function () { window.print(); }, 250);
      });
      window.addEventListener('afterprint', function () { window.close(); });
    </script>
  </body>
</html>`);
  w.document.close();
  return true;
}
