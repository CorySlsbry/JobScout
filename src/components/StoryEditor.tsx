"use client";

// Inline STAR+R editor. Creates new stories OR edits existing ones in-place.
// Collapsible — only the title shows until you click Edit.

import { useState } from "react";
import { ChevronDown, ChevronRight, Save, Trash2, Loader2 } from "lucide-react";
import type { InterviewStory } from "@/lib/types";

type Props =
  | { mode: "create"; story?: undefined }
  | { mode: "edit"; story: InterviewStory };

export default function StoryEditor(props: Props) {
  const initial: EditState = props.mode === "edit"
    ? fromStory(props.story)
    : empty();
  const [open, setOpen] = useState(props.mode === "create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<EditState>(initial);

  async function save() {
    setBusy(true); setError(null);
    try {
      const resp = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(props.mode === "edit" ? { id: props.story.id } : {}),
          title: story.title,
          situation: story.situation,
          task: story.task,
          action: story.action,
          result: story.result,
          reflection: story.reflection,
          tags: splitCsv(story.tagsCsv),
          question_archetypes: splitLines(story.archetypesText),
        }),
      });
      const j = await resp.json();
      if (!resp.ok) { setError((j as { error?: string }).error ?? "save_failed"); return; }
      if (props.mode === "create") {
        setStory(empty());
        // soft refresh to surface the new story
        if (typeof window !== "undefined") window.location.reload();
      } else {
        setOpen(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "fetch_error");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (props.mode !== "edit") return;
    if (!confirm(`Delete "${props.story.title}"? This can't be undone.`)) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/stories/${encodeURIComponent(props.story.id)}`, { method: "DELETE" });
      if (resp.ok && typeof window !== "undefined") window.location.reload();
      else setError("delete_failed");
    } finally { setBusy(false); }
  }

  if (props.mode === "edit" && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left flex items-center justify-between gap-2 group"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronRight size={14} className="text-fg-muted group-hover:text-accent shrink-0" />
          <span className="font-semibold truncate">{props.story.title}</span>
        </span>
        <span className="shrink-0 flex gap-1 flex-wrap justify-end">
          {props.story.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-tiny px-1.5 py-0.5 rounded-full bg-accent-soft text-accent">{t}</span>
          ))}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {props.mode === "edit" && (
        <button onClick={() => setOpen(false)} className="text-tiny text-fg-muted hover:text-fg flex items-center gap-1">
          <ChevronDown size={12} /> Collapse
        </button>
      )}

      <Field label="Title" hint='Short label — "Tesla CAN-bus diagnostic war story", not the whole story'>
        <input
          value={story.title}
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          placeholder="Tesla CAN-bus diagnostic war story"
          className="form-input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Situation" hint="The context — when, where, what was the setup">
          <textarea
            value={story.situation}
            onChange={(e) => setStory({ ...story, situation: e.target.value })}
            rows={3}
            className="form-input"
          />
        </Field>
        <Field label="Task" hint="What needed to happen, what was your role">
          <textarea
            value={story.task}
            onChange={(e) => setStory({ ...story, task: e.target.value })}
            rows={3}
            className="form-input"
          />
        </Field>
      </div>

      <Field label="Action" hint="What you specifically did. Use 'I', not 'we'. Specific verbs, concrete steps.">
        <textarea
          value={story.action}
          onChange={(e) => setStory({ ...story, action: e.target.value })}
          rows={5}
          className="form-input"
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Result" hint="Outcome — preferably with a number. What changed because of you?">
          <textarea
            value={story.result}
            onChange={(e) => setStory({ ...story, result: e.target.value })}
            rows={3}
            className="form-input"
          />
        </Field>
        <Field label="Reflection (+R)" hint="What you'd do differently, what you learned. The part most candidates skip.">
          <textarea
            value={story.reflection}
            onChange={(e) => setStory({ ...story, reflection: e.target.value })}
            rows={3}
            className="form-input"
          />
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Tags (comma-separated)" hint="leadership, conflict, ambiguity, failure, speed, etc.">
          <input
            value={story.tagsCsv}
            onChange={(e) => setStory({ ...story, tagsCsv: e.target.value })}
            placeholder="leadership, ambiguity, ship-under-pressure"
            className="form-input font-mono text-xs"
          />
        </Field>
        <Field label="Question archetypes (one per line)" hint="What behavioral questions does this story answer?">
          <textarea
            value={story.archetypesText}
            onChange={(e) => setStory({ ...story, archetypesText: e.target.value })}
            rows={2}
            placeholder={"Tell me about a time you led without authority\nDescribe a high-stakes diagnostic"}
            className="form-input font-mono text-xs"
          />
        </Field>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !story.title || !story.situation || !story.action} className="btn-premium text-sm">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
        {props.mode === "edit" && (
          <button onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 rounded-button border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-50">
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

type EditState = {
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tagsCsv: string;
  archetypesText: string;
};

function empty(): EditState {
  return { title: "", situation: "", task: "", action: "", result: "", reflection: "", tagsCsv: "", archetypesText: "" };
}

function fromStory(s: InterviewStory): EditState {
  return {
    title: s.title,
    situation: s.situation,
    task: s.task,
    action: s.action,
    result: s.result,
    reflection: s.reflection,
    tagsCsv: (s.tags ?? []).join(", "),
    archetypesText: (s.question_archetypes ?? []).join("\n"),
  };
}

function splitCsv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
function splitLines(s: string): string[] {
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-fg mb-0.5">{label}</span>
      {hint && <span className="block text-tiny text-fg-muted mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}
