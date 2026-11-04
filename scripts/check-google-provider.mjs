// Inspect Google OAuth provider config in Identity Platform.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
initializeApp({ credential: applicationDefault(), projectId: PROJECT });

const ga = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
const accessToken = (await (await ga.getClient()).getAccessToken()).token;
const headers = { Authorization: `Bearer ${accessToken}`, "x-goog-user-project": PROJECT };

// 1. Inspect Google IdP config.
console.log("=== Google IdP config ===");
const idpResp = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/defaultSupportedIdpConfigs/google.com`,
  { headers }
);
console.log(`status: ${idpResp.status}`);
const idp = await idpResp.json();
console.log(JSON.stringify(idp, null, 2));

// 2. Inspect general config block.
console.log("\n=== signIn.allowDuplicateEmails ===");
const cfgResp = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, { headers });
const cfg = await cfgResp.json();
console.log("signIn.allowDuplicateEmails:", cfg.signIn?.allowDuplicateEmails);
console.log("authorizedDomains:", cfg.authorizedDomains);
