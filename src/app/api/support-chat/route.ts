// POST /api/support-chat — Claude-powered support chat for the floating
// SupportChat widget. Anonymous-friendly (no auth required) so visitors can
// ask pre-purchase questions. Stateless — the client maintains the
// conversation in localStorage and ships the full history each turn.

import { NextResponse } from "next/server";
import { getAnthropic } from "@/lib/anthropic";
import { applyRateLimit, clientIp } from "@/lib/rate-limit";
import { captureError } from "@/lib/error-monitoring";
import { getAnthropicCircuit } from "@/lib/healers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// System prompt pinned to JobScout's product reality so the bot can't
// fabricate features. Keeps answers grounded in what we actually ship.
const SUPPORT_SYSTEM = `You are the JobScout support assistant. JobScout is an AI-powered job-search SaaS at https://jobscout-hq.com.

WHAT JOBSCOUT IS
• AI-ranked job feed across 7 boards: LinkedIn, Indeed, ZipRecruiter, Glassdoor, Greenhouse, Ashby, Lever.
• Every posting scored 0–100 against the user's resume, salary floor, target city.
• Push to phone the second a 90+ match goes live (PWA).
• AI-tailored resume + cover letter per posting.
• Pro tier ($19/mo) adds: Upwork bidder Chrome extension, Gmail inbox watcher, Interview Story Bank (STAR+R), Assessment uploader, unlimited tailoring.
• Boost tier ($29/mo) adds: Comp Intelligence (per-company salary benchmarks via Claude+web research), Negotiation Playbook (one-tap offer prep).
• Free tier: 5 jobs scored/day, 3 tailors/mo, 2 cover letters/mo, all boards, PWA push.

PRICING (source of truth — never quote anything else)
• Free: $0 forever.
• Pro: $19/month.
• Boost: $29/month.
• 30-day callback guarantee on Pro: if no callback in 30 days with playbook followed, email cory.salisbury@gmail.com for a full refund.
• Refer 2 friends who stay subscribed → permanent 20% off Pro.

WHAT YOU CAN DO
1. Answer questions about features, pricing, plans, data sources, privacy.
2. Help with onboarding ("how do I upload my resume", "how do I install on iPhone").
3. Triage bug reports — gather: what page, what you clicked, what you expected, what happened. Then say "I'm filing this with the team — use the bug button (🐛) in the bottom-right to formally submit it so they get the page context."
4. Refer to /pricing for the full feature comparison table.

WHAT YOU MUST NOT DO
• Invent features. If asked about a feature not in this prompt, say so honestly: "I don't think that ships today — let me file a feature request via the feedback button."
• Promise refunds outside the 30-day callback guarantee terms.
• Share other users' data (you don't have access anyway).
• Diagnose technical errors deeper than the surface — escalate to the bug button.

TONE
Direct, concise, warm. Mirror the founder's voice (Cory Salisbury — Tesla service tech background, opinionated, pragmatic). Avoid corporate boilerplate. No "I'd be happy to" or "feel free to". Just answer.

LENGTH
Keep replies under 120 words unless the user asks for a walkthrough. Use bullets for lists. Plain text only — no markdown formatting characters (no **, no #, no ---).`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  // Rate limit: 20 chats/min/IP burst, replenish 20/min. Bounds Claude API spend.
  if (applyRateLimit("support-chat", clientIp(req), { capacity: 20, refillPerMin: 20 })) {
    return NextResponse.json({
      error: "rate_limited",
      help: "Slow down a bit — try again in a minute.",
      reply: "I'm seeing a lot of messages from your network. Take a breath and try again in a moment.",
    }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const b = body as { messages?: unknown };
  if (!Array.isArray(b.messages)) {
    return NextResponse.json({ error: "messages_required", help: "send { messages: [{role,content}, ...] }" }, { status: 400 });
  }
  // Defensive parsing — only let through user/assistant + non-empty string content,
  // capped at 30 turns + 6000 chars per turn so a hijacked client can't blow up our token bill.
  const turns: ChatMessage[] = b.messages
    .slice(-30)
    .map((m: unknown) => {
      const mm = m as { role?: unknown; content?: unknown };
      const role = mm.role === "user" || mm.role === "assistant" ? mm.role : null;
      const content = typeof mm.content === "string" ? mm.content.trim().slice(0, 6000) : "";
      return role && content ? { role, content } : null;
    })
    .filter((m): m is ChatMessage => m !== null);

  if (turns.length === 0) return NextResponse.json({ error: "empty_messages" }, { status: 400 });

  // Self-healing — short-circuit if the Anthropic breaker is currently open.
  // Saves Cloud Run compute on doomed requests, gives users a clean fallback.
  const circuit = await getAnthropicCircuit();
  if (circuit.open) {
    return NextResponse.json({
      error: "anthropic_circuit_open",
      help: circuit.reason ?? "Anthropic is currently failing; auto-recovery in progress.",
      reply: "Our AI is temporarily out — we're recovering automatically. Try in a few minutes, or hit the Bug button to leave a note.",
    }, { status: 503 });
  }

  const anthropic = getAnthropic();
  if (!anthropic) {
    return NextResponse.json({
      error: "chat_not_configured",
      help: "ANTHROPIC_API_KEY is not set on the server.",
      // Friendly fallback so the widget still feels alive even if the key isn't wired.
      reply: "I'm offline at the moment — try the feedback button (💬) in the bottom-right, or email cory.salisbury@gmail.com.",
    }, { status: 503 });
  }

  try {
    const res = await anthropic.messages.create({
      // Haiku is plenty for FAQ-style support; cheap + fast keeps the chat
      // snappy and the bill small. Promote to Sonnet only if quality suffers.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SUPPORT_SYSTEM,
      messages: turns,
    });
    const text = res.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    return NextResponse.json({ ok: true, reply: text || "Sorry — try rephrasing." });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // Tag with integration='anthropic' so the circuit-breaker healer can see it.
    void captureError(e, {
      source: "server",
      path: "/api/support-chat",
      integration: "anthropic",
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      error: "chat_upstream_failed",
      help: msg,
      reply: "Hit an error talking to the model. Try again in a sec, or use the feedback button (💬).",
    }, { status: 502 });
  }
}
