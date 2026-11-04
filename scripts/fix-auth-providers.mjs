// Inspect + force-enable email/password sign-in via the Identity Toolkit
// Admin v2 REST API. firebase-admin's app provides ADC; we ask for a fresh
// access token from it (cleaner than gcloud's user token which 403'd earlier).

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
initializeApp({ credential: applicationDefault(), projectId: PROJECT });

const ga = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const client = await ga.getClient();
const tokenResp = await client.getAccessToken();
const accessToken = tokenResp.token;
if (!accessToken) { console.error("no access token"); process.exit(1); }

const adminBase = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;

// ADC requires a quota project header — without it, identitytoolkit returns 403.
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "x-goog-user-project": PROJECT,
};

console.log("=== GET current /admin/v2/projects/.../config ===");
const getResp = await fetch(adminBase, { headers });
console.log(`status: ${getResp.status}`);
const cur = await getResp.json();
console.log("authorizedDomains:", cur.authorizedDomains ?? "(missing)");
console.log("signIn.email:", JSON.stringify(cur.signIn?.email ?? null));
console.log("signIn.phoneNumber:", JSON.stringify(cur.signIn?.phoneNumber ?? null));
console.log("signIn.anonymous:", JSON.stringify(cur.signIn?.anonymous ?? null));

console.log("\n=== PATCH email/password enabled = true ===");
const patchBody = {
  signIn: { email: { enabled: true, passwordRequired: true } },
};
const patchResp = await fetch(`${adminBase}?updateMask=signIn.email`, {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify(patchBody),
});
console.log(`status: ${patchResp.status}`);
const after = await patchResp.json();
console.log("response.signIn.email:", JSON.stringify(after.signIn?.email ?? after));
