// POST /api/assessments/extract
//
// Body shapes (one of):
//   - multipart/form-data with `file` (image/* or application/pdf) and optional `name`
//   - application/json with { text: string, name?: string }
//
// Behavior:
//   - Sends the input to Claude Sonnet (vision for images, document blocks
//     for PDFs, text for plaintext) with the ASSESSMENT_EXTRACT_SYSTEM prompt.
//   - Returns a structured { summary_md, raw_text?, suggested_name } so the
//     UI can preview and the user can edit before saving.
//
// Used by the AssessmentUploadModal — the mobile flow is: snap a screenshot
// of any assessment result page, upload it here, save the extracted summary.

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAnthropic, ASSESSMENT_EXTRACT_SYSTEM } from "@/lib/anthropic";
import { hasTier } from "@/lib/users";
import { recordUsage } from "@/lib/quotas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — keeps Claude API happy

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.record || !hasTier(user.record, "pro")) {
    return NextResponse.json({
      error: "tier_required",
      help: "Assessment uploads are a Pro feature ($19/mo).",
      required_tier: "pro",
      current_tier: user.record?.plan ?? "free",
    }, { status: 402 });
  }

  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503 });

  const contentType = req.headers.get("content-type") || "";

  // ── Path A: JSON text paste ─────────────────────────────────────────
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null) as { text?: string; name?: string } | null;
    const text = body?.text?.trim();
    if (!text || text.length < 30) {
      return NextResponse.json({ error: "text_too_short" }, { status: 400 });
    }
    if (text.length > 200_000) {
      return NextResponse.json({ error: "text_too_long" }, { status: 400 });
    }
    const result = await extractFromText(client, text);
    void recordUsage(user.record.id, "assessments_extract");
    return NextResponse.json({ ok: true, ...result, source_kind: "text", suggested_name: body?.name ?? result.suggested_name });
  }

  // ── Path B: multipart file upload ───────────────────────────────────
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "unsupported_content_type" }, { status: 415 });
  }
  const form = await req.formData();
  const file = form.get("file");
  const name = (form.get("name") as string | null) ?? null;
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", max_mb: 12 }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = (file.type || "").toLowerCase();
  const filename = (file as File).name || null;

  let result;
  let sourceKind: "image" | "pdf";
  if (mime.startsWith("image/")) {
    result = await extractFromImage(client, bytes, mime);
    sourceKind = "image";
  } else if (mime === "application/pdf" || (filename?.toLowerCase().endsWith(".pdf") ?? false)) {
    result = await extractFromPdf(client, bytes);
    sourceKind = "pdf";
  } else {
    return NextResponse.json({ error: "unsupported_file_type", help: "Use a PNG/JPG screenshot or a PDF." }, { status: 415 });
  }
  void recordUsage(user.record.id, "assessments_extract");
  return NextResponse.json({
    ok: true,
    ...result,
    source_kind: sourceKind,
    source_filename: filename,
    suggested_name: name ?? result.suggested_name,
  });
}

// ── Extractors ───────────────────────────────────────────────────────

type Extracted = { summary_md: string; raw_text: string | null; suggested_name: string };

async function extractFromText(client: NonNullable<ReturnType<typeof getAnthropic>>, text: string): Promise<Extracted> {
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: ASSESSMENT_EXTRACT_SYSTEM,
    messages: [{ role: "user", content: `Extract a structured assessment summary from the following:\n\n${text}` }],
  });
  return parseExtractedJson(resp, text.slice(0, 1500));
}

async function extractFromImage(client: NonNullable<ReturnType<typeof getAnthropic>>, bytes: Buffer, mime: string): Promise<Extracted> {
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  const media_type = (allowed.includes(mime) ? mime : "image/png") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: ASSESSMENT_EXTRACT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type, data: bytes.toString("base64") } },
        { type: "text", text: "Extract a structured assessment summary from this screenshot." },
      ],
    }],
  });
  return parseExtractedJson(resp, null);
}

async function extractFromPdf(client: NonNullable<ReturnType<typeof getAnthropic>>, bytes: Buffer): Promise<Extracted> {
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: ASSESSMENT_EXTRACT_SYSTEM,
    messages: [{
      role: "user",
      content: [
        // The SDK accepts a document content block for PDFs. Cast through
        // unknown because Anthropic's TS types haven't always shipped this.
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } } as unknown as { type: "text"; text: string },
        { type: "text", text: "Extract a structured assessment summary from this PDF." },
      ],
    }],
  });
  return parseExtractedJson(resp, null);
}

// ── Parse Claude's JSON envelope ──────────────────────────────────────

function parseExtractedJson(resp: { content: Array<{ type: string; text?: string }> }, rawFallback: string | null): Extracted {
  const raw = resp.content.map((c) => c.type === "text" ? (c.text ?? "") : "").join("").trim();
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let json: { summary_md?: string; raw_text?: string; suggested_name?: string } = {};
  try { json = JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === "{") depth++;
        else if (cleaned[i] === "}") {
          depth--;
          if (depth === 0) {
            try { json = JSON.parse(cleaned.slice(start, i + 1)); } catch { /* fall through */ }
            break;
          }
        }
      }
    }
  }
  return {
    summary_md: (json.summary_md ?? cleaned).trim(),
    raw_text: json.raw_text ?? rawFallback,
    suggested_name: (json.suggested_name ?? "Assessment result").trim().slice(0, 200),
  };
}
