// Pre-configured company portals. Each entry maps a display name to the
// portal type + the URL slug that portal uses for the company's job board.
//
// Greenhouse:  boards-api.greenhouse.io/v1/boards/{slug}/jobs
// Ashby:       api.ashbyhq.com/posting-api/job-board/{slug}
// Lever:       api.lever.co/v0/postings/{slug}?mode=json
//
// All three are unauthenticated public APIs — no key needed. Inspired by
// santifer/career-ops's portals.example.yml, retuned for Cory's target
// list (Anthropic, AI infra, dev-tools, vertical SaaS).

export type PortalKind = "greenhouse" | "ashby" | "lever";

export type Portal = {
  name: string;
  kind: PortalKind;
  slug: string;
  /** Optional categories or department filters — applied client-side after fetch. */
  categories?: string[];
};

export const PORTALS: Portal[] = [
  // ── AI labs ─────────────────────────────────────────────────────────
  { name: "Anthropic",     kind: "greenhouse", slug: "anthropic" },
  { name: "OpenAI",        kind: "ashby",      slug: "openai" },
  { name: "ElevenLabs",    kind: "ashby",      slug: "elevenlabs" },
  { name: "Cohere",        kind: "lever",      slug: "cohere" },
  { name: "Mistral AI",    kind: "lever",      slug: "mistral" },
  { name: "Hugging Face",  kind: "greenhouse", slug: "huggingface" },
  { name: "Perplexity",    kind: "ashby",      slug: "perplexity" },
  { name: "Inflection AI", kind: "ashby",      slug: "inflection" },

  // ── Dev tools / automation infra ────────────────────────────────────
  { name: "Retool",        kind: "ashby",      slug: "retool" },
  { name: "n8n",           kind: "ashby",      slug: "n8n" },
  { name: "Zapier",        kind: "ashby",      slug: "zapier" },
  { name: "Make (Integromat)", kind: "lever",  slug: "make" },
  { name: "Vercel",        kind: "ashby",      slug: "vercel" },
  { name: "Supabase",      kind: "ashby",      slug: "supabase" },
  { name: "Linear",        kind: "ashby",      slug: "linear" },
  { name: "Figma",         kind: "greenhouse", slug: "figma" },
  { name: "Notion",        kind: "greenhouse", slug: "notion" },
  { name: "Airtable",      kind: "greenhouse", slug: "airtable" },

  // ── Vertical SaaS / horizontal SaaS Cory targets ────────────────────
  { name: "Stripe",        kind: "greenhouse", slug: "stripe" },
  { name: "Plaid",         kind: "greenhouse", slug: "plaid" },
  { name: "Brex",          kind: "ashby",      slug: "brex" },
  { name: "Mercury",       kind: "ashby",      slug: "mercury" },
  { name: "Ramp",          kind: "ashby",      slug: "ramp" },
  { name: "GoHighLevel",   kind: "lever",      slug: "gohighlevel" },
  { name: "ClickUp",       kind: "lever",      slug: "clickup" },
];
