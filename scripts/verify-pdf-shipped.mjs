// Sign in as the audit user, fetch /jobs/<id>, crawl all JS chunks the page
// preloads, and grep for our PDF code.

const PROJECT = "jobscout-app";
const apiKey = "REDACTED";
const BASE = "https://jobscout-wnwafxvfia-uw.a.run.app";
const EMAIL = "audit@noadappsutah.com";
const PASSWORD = "REDACTED";

// reset the audit user's password (server-side via Admin SDK)
const { initializeApp, applicationDefault } = await import("firebase-admin/app");
const { getAuth } = await import("firebase-admin/auth");
initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const adminAuth = getAuth();
const user = await adminAuth.getUserByEmail(EMAIL);
await adminAuth.updateUser(user.uid, { password: PASSWORD });

// sign in REST
const signIn = await (await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }) }
)).json();
if (!signIn.idToken) { console.error("sign-in failed:", signIn); process.exit(1); }

// mint session cookie
const sessResp = await fetch(`${BASE}/api/auth/session`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: signIn.idToken }),
});
const cookieHeader = sessResp.headers.get("set-cookie") ?? "";
const sessionCookie = cookieHeader.match(/jobscout_session=([^;]+)/)?.[1];
if (!sessionCookie) { console.error("no session cookie"); process.exit(1); }

// fetch /jobs/<a real id>
const gcpToken = process.env.GCP_TOKEN ?? "";
const fs = await (await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/jobs?pageSize=1`,
  { headers: { Authorization: `Bearer ${gcpToken}` } })).json();
const jobId = fs.documents[0].name.split("/").pop();
const cookieStr = `jobscout_session=${sessionCookie}`;

console.log(`Fetching /jobs/${jobId} with cookie len=${sessionCookie.length}…`);
const pageResp = await fetch(`${BASE}/jobs/${jobId}`, {
  headers: { Cookie: cookieStr },
  redirect: "manual",
});
console.log(`status: ${pageResp.status}  Location: ${pageResp.headers.get("location") ?? "(none)"}`);
const page = await pageResp.text();
console.log(`response length: ${page.length} chars  starts: ${page.slice(0, 100).replace(/\s+/g, " ")}`);

// Sanity: confirm we're on the right page
console.log(`page has 'Tailor my resume': ${page.includes("Tailor my resume")}`);
console.log(`page has 'Cover letter': ${page.includes("Cover letter")}`);

// Crawl ALL chunks referenced by the page (might be in <link rel=preload> too)
const allUrls = [
  ...page.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/g),
].map((m) => m[1]);
const chunkUrls = [...new Set(allUrls.filter(u => u.endsWith(".js")))];
console.log(`${chunkUrls.length} script chunks (including preloads). Grepping…`);

const needles = ["markdownToPdfBlob", "Ready to apply", "jsPDF", "Download .pdf", "Download .docx"];
const hits = Object.fromEntries(needles.map((n) => [n, null]));

for (const u of chunkUrls) {
  const text = await (await fetch(`${BASE}${u}`)).text();
  for (const n of needles) {
    if (!hits[n] && text.includes(n)) hits[n] = u;
  }
  if (Object.values(hits).every(Boolean)) break;
}
console.log("\nresults:");
for (const [needle, where] of Object.entries(hits)) {
  console.log(`  ${needle.padEnd(20)} → ${where ?? "(not found in initial chunks — likely in a lazy chunk)"}`);
}
