// Gmail API access for the Upwork inbox watcher.
//
// Uses raw fetch against Google's OAuth2 + Gmail REST APIs — no `googleapis`
// dependency. The user authorizes once (OAuth consent); we store the
// long-lived refresh_token on the profile and derive short-lived access
// tokens per cron run.
//
// Scope: gmail.modify — needed to read messages AND add a "JobScout/Processed"
// label so the watcher doesn't re-process the same alert email.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

// ── OAuth ───────────────────────────────────────────────────────────────

export function gmailAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GMAIL_SCOPE);
  u.searchParams.set("access_type", "offline");   // → returns a refresh_token
  u.searchParams.set("prompt", "consent");        // force refresh_token even on re-auth
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export type GmailTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

export async function exchangeCodeForTokens(
  code: string, clientId: string, clientSecret: string, redirectUri: string,
): Promise<GmailTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`token exchange failed: ${resp.status} ${await resp.text()}`);
  return resp.json() as Promise<GmailTokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string, clientId: string, clientSecret: string,
): Promise<string> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) throw new Error(`token refresh failed: ${resp.status} ${await resp.text()}`);
  const j = (await resp.json()) as GmailTokenResponse;
  return j.access_token;
}

// ── Gmail REST ──────────────────────────────────────────────────────────

export type GmailMessageMeta = { id: string; threadId: string };

export async function listMessages(accessToken: string, query: string, maxResults = 25): Promise<GmailMessageMeta[]> {
  const u = new URL(`${GMAIL_API}/messages`);
  u.searchParams.set("q", query);
  u.searchParams.set("maxResults", String(maxResults));
  const resp = await fetch(u, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`gmail list failed: ${resp.status} ${await resp.text()}`);
  const j = (await resp.json()) as { messages?: GmailMessageMeta[] };
  return j.messages ?? [];
}

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};
export type GmailFullMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
};

export async function getMessage(accessToken: string, id: string): Promise<GmailFullMessage> {
  const resp = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error(`gmail get failed: ${resp.status} ${await resp.text()}`);
  return resp.json() as Promise<GmailFullMessage>;
}

// Walk the MIME tree and return the best body content — prefers text/html,
// falls back to text/plain. Gmail base64url-encodes part bodies.
export function extractBody(msg: GmailFullMessage): { html: string; text: string } {
  let html = "";
  let text = "";
  const walk = (part?: GmailPart) => {
    if (!part) return;
    const data = part.body?.data;
    if (data) {
      const decoded = decodeBase64Url(data);
      if (part.mimeType === "text/html") html += decoded;
      else if (part.mimeType === "text/plain") text += decoded;
    }
    (part.parts ?? []).forEach(walk);
  };
  walk(msg.payload);
  return { html, text };
}

export function getHeader(msg: GmailFullMessage, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function decodeBase64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

// ── Labels ──────────────────────────────────────────────────────────────

// Returns the id of a label with the given name, creating it if absent.
export async function ensureLabel(accessToken: string, name: string): Promise<string> {
  const listResp = await fetch(`${GMAIL_API}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listResp.ok) {
    const j = (await listResp.json()) as { labels?: Array<{ id: string; name: string }> };
    const found = j.labels?.find((l) => l.name === name);
    if (found) return found.id;
  }
  const createResp = await fetch(`${GMAIL_API}/labels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  if (!createResp.ok) throw new Error(`label create failed: ${createResp.status} ${await createResp.text()}`);
  const created = (await createResp.json()) as { id: string };
  return created.id;
}

export async function addLabel(accessToken: string, messageId: string, labelId: string): Promise<void> {
  const resp = await fetch(`${GMAIL_API}/messages/${messageId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  if (!resp.ok) throw new Error(`label apply failed: ${resp.status} ${await resp.text()}`);
}
