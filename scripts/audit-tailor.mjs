// Fabrication audit: mint a Firebase session cookie for an admin test user,
// call /api/tailor-resume on the live URL with it, and verify the output
// doesn't fabricate employers or skills not in the base resume.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
const BASE_URL = process.env.BASE_URL ?? "https://jobscout-wnwafxvfia-uw.a.run.app";

initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const auth = getAuth();

// 1. Ensure a test user exists with a known password.
const TEST_EMAIL = "audit@noadappsutah.com";
const TEST_PASSWORD = "REDACTED!" + Math.random().toString(36).slice(2, 8);
let user;
try {
  user = await auth.getUserByEmail(TEST_EMAIL);
  await auth.updateUser(user.uid, { password: TEST_PASSWORD });
} catch {
  user = await auth.createUser({ email: TEST_EMAIL, password: TEST_PASSWORD, displayName: "Audit Bot" });
}
console.log(`Using test user uid=${user.uid}`);

// 2. Sign in via Identity Toolkit REST (Google does the signing on their side).
const apiKey = "REDACTED";
const signInResp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, returnSecureToken: true }),
  }
);
const signed = await signInResp.json();
if (!signed.idToken) {
  console.error("Sign-in failed:", signed);
  console.error("(If 'OPERATION_NOT_ALLOWED', re-enable Email/Password in Firebase console.)");
  process.exit(1);
}

// 3. Exchange ID token → session cookie (the format the app expects).
const sessionCookie = await fetch(`${BASE_URL}/api/auth/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: signed.idToken }),
}).then(async (r) => {
  if (!r.ok) {
    console.error("Session exchange failed:", r.status, await r.text().catch(() => ""));
    process.exit(1);
  }
  // Pull cookie out of Set-Cookie header
  const sc = r.headers.get("set-cookie") ?? "";
  const m = sc.match(/jobscout_session=([^;]+)/);
  return m ? m[1] : "";
});
if (!sessionCookie) { console.error("No session cookie received."); process.exit(1); }
console.log("Session cookie obtained.");

// 3. Read the base resume from Firestore so we can compare claims.
const fsResp = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/profile/me`,
  { headers: { Authorization: `Bearer ${process.env.GCP_TOKEN ?? ""}` } }
);
let baseResume = "";
if (fsResp.ok) {
  const j = await fsResp.json();
  baseResume = j?.fields?.resume_md?.stringValue ?? "";
}
if (!baseResume) {
  console.warn("Couldn't read base resume from Firestore (no GCP_TOKEN). Continuing without ground-truth check.");
}

// 4. Pick a job with a long description.
const jobsResp = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/jobs?pageSize=20`,
  { headers: { Authorization: `Bearer ${process.env.GCP_TOKEN ?? ""}` } }
);
const jobsJ = await jobsResp.json();
const docs = jobsJ.documents ?? [];
const picked = docs
  .map((d) => ({
    id: d.name.split("/").pop(),
    title: d.fields?.title?.stringValue ?? "",
    company: d.fields?.company?.stringValue ?? "",
    description: d.fields?.description?.stringValue ?? "",
  }))
  .sort((a, b) => b.description.length - a.description.length)[0];
console.log(`\nPicked job: ${picked.title} @ ${picked.company} (desc ${picked.description.length} chars)`);

// 5. POST /api/tailor-resume WITH the session cookie.
const tailorResp = await fetch(`${BASE_URL}/api/tailor-resume`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Cookie": `jobscout_session=${sessionCookie}`,
  },
  body: JSON.stringify({ jobId: picked.id }),
});
console.log(`/api/tailor-resume → ${tailorResp.status}`);
if (!tailorResp.ok) {
  const t = await tailorResp.text();
  console.error("Body:", t.slice(0, 400));
  process.exit(1);
}
const tailored = await tailorResp.text();
console.log(`Tailored resume length: ${tailored.length} chars`);

// 6. Audit. Look for tools in JD that are NOT in base; verify they're NOT in tailored.
const baseLower = baseResume.toLowerCase();
const tailLower = tailored.toLowerCase();
const jdLower = picked.description.toLowerCase();
const TECH = ["kubernetes","docker","python","java","ruby","golang","scala","kafka","redis","mongodb","mysql","aws","azure","gcp","spring","django","rails","airflow","kotlin","swift","rust","graphql","grpc","spark","hadoop","tableau","power bi","kibana","elasticsearch","kotlin","terraform","jenkins"];
const jdHas = TECH.filter((t) => jdLower.includes(t));
const baseLacks = jdHas.filter((t) => !baseLower.includes(t));
const fabricated = baseLacks.filter((t) => tailLower.includes(t));
console.log("\n=== FABRICATION AUDIT ===");
console.log(`Tools in JD: ${jdHas.join(", ") || "(none)"}`);
console.log(`Tools in JD but NOT in base (temptations): ${baseLacks.join(", ") || "(none)"}`);
console.log(`Tools tailored mentioned that aren't in base (fabrications): ${fabricated.join(", ") || "(NONE — clean) ✅"}`);

// 7. Also verify employers.
const tailoredCompanies = [...tailored.matchAll(/###\s+[^—\n]+—\s+([^,\n]+)/g)].map((m) => m[1].trim());
const inventedCompanies = tailoredCompanies.filter((c) => !baseLower.includes(c.toLowerCase()));
console.log("\nEmployers in tailored:", tailoredCompanies);
console.log(`Invented employers: ${inventedCompanies.length === 0 ? "(NONE — clean) ✅" : inventedCompanies.join(", ")}`);

console.log("\n=== first 800 chars of tailored output ===");
console.log(tailored.slice(0, 800));
