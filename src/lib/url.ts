// Returns the public app URL given an incoming Request. On Cloud Run,
// `new URL(req.url).origin` resolves to the container's bind interface
// (`http://0.0.0.0:8080`) — useless in emails and OAuth redirects.
//
// Fallback chain:
//   1. OAUTH_BASE_URL env var       — explicit override (preferred)
//   2. x-forwarded-host header      — set by Cloud Run / most proxies
//   3. url.origin                   — last resort, only useful in local dev

export function publicAppUrl(req: Request): string {
  if (process.env.OAUTH_BASE_URL) return process.env.OAUTH_BASE_URL;
  const fwdHost = req.headers.get("x-forwarded-host");
  if (fwdHost) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${fwdHost}`;
  }
  return new URL(req.url).origin;
}
