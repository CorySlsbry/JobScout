// POST /api/comp/lookup
// Body: { company, role, level?, geography?, force_refresh? }
// Returns: { ok, benchmark, source: 'cache' | 'fresh' }
//
// Boost-tier only. Read-through cache: hit Firestore first; on miss or
// stale (>7d), call Claude Sonnet with web_search to research, cache the
// result, return it.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { hasTier } from "@/lib/users";
import { recordUsage, checkQuota, quotaErrorBody } from "@/lib/quotas";
import { getAnthropic, COMP_RESEARCH_SYSTEM, buildCompResearchPrompt } from "@/lib/anthropic";
import { compCacheKey, getCachedComp, isFresh, newCompId, upsertComp, buildExpiresAt } from "@/lib/comp";
import type { CompBenchmark } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const Body = z.object({
  company: z.string().min(1).max(200),
  role: z.string().min(1).max(200),
  level: z.string().max(100).optional().nullable(),
  geography: z.string().max(200).optional().nullable(),
  force_refresh: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !user.record) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasTier(user.record, "boost")) {
    return NextResponse.json({
      error: "tier_required",
      help: "Comp Intelligence is a Boost feature ($29/mo).",
      required_tier: "boost",
      current_tier: user.record.plan,
    }, { status: 402 });
  }
  const gate = await checkQuota(user.record, "comp_lookups");
  if (!gate.ok) return NextResponse.json(quotaErrorBody(gate), { status: 402 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }); }

  const cache_key = compCacheKey({
    company: body.company,
    role: body.role,
    level: body.level ?? null,
    geography: body.geography ?? null,
  });

  // 1) Cache hit?
  if (!body.force_refresh) {
    const cached = await getCachedComp(cache_key);
    if (cached && isFresh(cached)) {
      return NextResponse.json({ ok: true, benchmark: cached, source: "cache" });
    }
  }

  // 2) Research via Claude + web search.
  const client = getAnthropic();
  if (!client) return NextResponse.json({ error: "anthropic_not_configured" }, { status: 503 });

  const prompt = buildCompResearchPrompt({
    company: body.company,
    role: body.role,
    level: body.level ?? null,
    geography: body.geography ?? null,
  });

  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3_000,
    system: COMP_RESEARCH_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    // Web-search tool — newer Claude API supports this for grounded answers.
    // If the tool isn't recognized by the SDK version, fallback path below
    // still parses whatever JSON Claude returns from its model knowledge alone.
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 } as unknown as never],
  });

  const raw = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  const json = extractJson(raw);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "comp_parse_failed", raw: raw.slice(0, 500) }, { status: 502 });
  }

  const now = new Date().toISOString();
  const benchmark: CompBenchmark = {
    id: newCompId(),
    cache_key,
    company: body.company,
    role: body.role,
    level: body.level ?? null,
    geography: body.geography ?? null,
    base_low: numOrNull((json as Record<string, unknown>).base_low),
    base_high: numOrNull((json as Record<string, unknown>).base_high),
    total_low: numOrNull((json as Record<string, unknown>).total_low),
    total_high: numOrNull((json as Record<string, unknown>).total_high),
    equity_notes: strOrNull((json as Record<string, unknown>).equity_notes),
    narrative_md: strOrEmpty((json as Record<string, unknown>).narrative_md),
    sources: Array.isArray((json as Record<string, unknown>).sources)
      ? ((json as { sources: Array<unknown> }).sources.map((s) => {
          const o = s as Record<string, unknown>;
          return { label: strOrEmpty(o.label), url: strOrNull(o.url) };
        }))
      : [],
    confidence: clamp((json as Record<string, unknown>).confidence, 0, 100),
    researched_at: now,
    expires_at: buildExpiresAt(now),
    created_at: now,
    updated_at: now,
  };

  await upsertComp(benchmark);
  void recordUsage(user.record.id, "comp_lookups");

  return NextResponse.json({ ok: true, benchmark, source: "fresh" });
}

// ── parsers ────────────────────────────────────────────────────────────

function extractJson(text: string): unknown | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === "{") depth++;
    else if (cleaned[i] === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function clamp(v: unknown, lo: number, hi: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
