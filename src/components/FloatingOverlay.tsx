"use client";

// Floating in-app widgets — port of the SpaOwner-HQ pattern.
//
//   • 🐛 BUG     — slider modal, captures page URL + user agent, posts to /api/feedback
//   • 💬 FEEDBACK — same flow, different type tag
//   • 💭 chat    — bottom-left floating chat button → AI support via /api/support-chat
//
// Path-gated: marketing/auth pages don't get the chrome (would feel spammy on
// the landing). App pages + admin always get all three.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, MessageSquare, X, Send, MessagesSquare, Loader2, Check, AlertCircle } from "lucide-react";

type FeedbackType = "bug" | "feedback" | "feature";

const EXCLUDED_PREFIXES = ["/signin", "/signup", "/api"];

export default function FloatingOverlay() {
  const pathname = usePathname();
  if (!pathname || EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <>
      <FeedbackWidget />
      <ChatWidget />
    </>
  );
}

/* ─────────────────────── 🐛 BUG + 💬 FEEDBACK ─────────────────────── */

function FeedbackWidget() {
  const [mode, setMode] = useState<FeedbackType | null>(null);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2 items-end">
        <button
          onClick={() => setMode("bug")}
          aria-label="Report a bug"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--bad)]/40 bg-[var(--bg-elev)]/80 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-[var(--bad)] shadow-lg hover:bg-[var(--bad-soft)] transition-all"
        >
          <Bug size={14} /> <span>BUG</span>
        </button>
        <button
          onClick={() => setMode("feedback")}
          aria-label="Send feedback"
          className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-2)]/40 bg-[var(--bg-elev)]/80 backdrop-blur-md px-3 py-1.5 text-xs font-semibold text-[var(--accent-2)] shadow-lg hover:bg-[var(--accent-2-soft)] transition-all"
        >
          <MessageSquare size={14} /> <span>FEEDBACK</span>
        </button>
      </div>

      {mode && <FeedbackSlider mode={mode} onClose={() => setMode(null)} />}
    </>
  );
}

function FeedbackSlider({ mode, onClose }: { mode: FeedbackType; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { taRef.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) { setError("Message must be at least 3 characters."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: mode,
          message: message.trim(),
          page_url: typeof window !== "undefined" ? window.location.href : "",
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "submit_failed"); return; }
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "network_error");
    } finally { setBusy(false); }
  }

  const config = mode === "bug"
    ? { title: "Report a bug", icon: <Bug size={18} className="text-[var(--bad)]" />, accentClass: "text-[var(--bad)]", placeholder: "What broke? What were you trying to do? Steps to reproduce help a lot." }
    : { title: "Send feedback",  icon: <MessageSquare size={18} className="text-[var(--accent-2)]" />, accentClass: "text-[var(--accent-2)]", placeholder: "What would make JobScout better? Idea, gripe, anything — all read." };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass relative w-full max-w-md rounded-3xl p-6 sm:p-7"
        style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev-2)]" aria-label="Close">
          <X size={18} />
        </button>

        <div className="flex items-center gap-2">
          {config.icon}
          <h2 className={`font-[family-name:var(--font-inter-tight)] text-xl font-bold tracking-tight ${config.accentClass}`}>
            {config.title}
          </h2>
        </div>

        {done ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-[var(--good)]/30 bg-[var(--good-soft)] p-3 text-sm text-[var(--good)]">
            <Check size={16} /> Got it — landed in /admin/feedback. Thank you.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <textarea
              ref={taRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={config.placeholder}
              rows={5}
              maxLength={4000}
              className="form-input w-full resize-none"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[var(--muted)]">
                {message.length}/4000 · current page captured
              </p>
              <button type="submit" disabled={busy || message.trim().length < 3}
                className="btn-cosmic text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send
              </button>
            </div>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2 text-xs text-[var(--bad)]">
                <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── 💭 AI SUPPORT CHAT ─────────────────────── */

type ChatMsg = { role: "user" | "assistant"; content: string };

const CHAT_STORAGE_KEY = "jobscout_support_chat_v1";

function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Hydrate conversation from localStorage so a page reload doesn't lose context.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMsg[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-30));
      }
    } catch {}
  }, []);

  // Persist on every change (cheap; messages are tiny).
  useEffect(() => {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  // Auto-scroll to latest on new message.
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, open]);

  const greeting = useMemo<ChatMsg>(() => ({
    role: "assistant",
    content: "Hey — I'm JobScout's support bot. Ask me anything about features, pricing, the 30-day callback guarantee, or how something works. Real bugs? Use the 🐛 BUG button so the team gets the page context.",
  }), []);
  const displayMessages = messages.length === 0 ? [greeting] : messages;

  async function send(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const j = await res.json().catch(() => ({}));
      const reply = (j as { reply?: string }).reply ?? "Sorry — try again in a moment.";
      setMessages([...next, { role: "assistant", content: reply }]);
      if (!res.ok) setError((j as { help?: string; error?: string }).help ?? (j as { error?: string }).error ?? "chat_error");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "network_error");
      setMessages([...next, { role: "assistant", content: "Connection hiccup — try again." }]);
    } finally { setBusy(false); }
  }

  function clearHistory() {
    setMessages([]);
    try { localStorage.removeItem(CHAT_STORAGE_KEY); } catch {}
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-4 left-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-[var(--bg-elev)]/80 backdrop-blur-md px-3 py-2 text-xs font-semibold text-[var(--fg)] border border-[var(--accent-2)]/40 shadow-lg hover:bg-[var(--accent-2-soft)] transition-all"
      >
        <MessagesSquare size={14} className="text-[var(--accent-2)]" /> <span>{open ? "Close" : "Support"}</span>
      </button>

      {open && (
        <div className="fixed bottom-16 left-4 z-40 w-[92vw] sm:w-96 max-h-[70vh] glass rounded-2xl flex flex-col overflow-hidden" style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
          <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-elev-2)]/60">
            <div>
              <p className="font-semibold text-sm">JobScout support</p>
              <p className="text-[10px] text-[var(--muted)]">Claude-powered · trained on JobScout&apos;s docs</p>
            </div>
            <button onClick={clearHistory} className="text-[10px] text-[var(--muted)] hover:text-[var(--fg)] underline decoration-[var(--accent-2)]/30">
              Clear
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {displayMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  m.role === "user"
                    ? "bg-[var(--accent-2-soft)] text-[var(--fg)] rounded-br-sm"
                    : "bg-[var(--bg-elev-2)] text-[var(--fg)] rounded-bl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="bg-[var(--bg-elev-2)] rounded-2xl rounded-bl-sm px-3 py-2 inline-flex items-center gap-1.5 text-[var(--muted)]">
                  <Loader2 size={12} className="animate-spin" /> typing…
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="border-t border-[var(--border)] p-2 bg-[var(--bg-elev-2)]/60 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about features, pricing, anything…"
              className="form-input flex-1 !py-2 text-sm"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-full p-2 bg-[var(--accent-2)] text-white disabled:opacity-40">
              <Send size={14} />
            </button>
          </form>

          {error && <p className="px-3 pb-2 text-[10px] text-[var(--bad)]">{error}</p>}
        </div>
      )}
    </>
  );
}
