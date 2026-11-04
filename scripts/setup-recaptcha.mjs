// One-time admin script to enable reCAPTCHA Enterprise protection on
// Firebase Auth email/password flows in AUDIT mode (gathers scores, no blocking).
//
// Run: node scripts/setup-recaptcha.mjs
// Auth: uses gcloud Application Default Credentials. Run `gcloud auth application-default login` first if needed.
//
// To later flip to ENFORCE (after reviewing audit metrics), re-run with FLIP=ENFORCE in env.

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
const STATE = process.env.FLIP === "ENFORCE" ? "ENFORCE" : "AUDIT";

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });

const auth = getAuth();
const config = await auth.projectConfigManager().updateProjectConfig({
  recaptchaConfig: {
    emailPasswordEnforcementState: STATE,
    // Block requests that score below 0.5 (mid threshold). reCAPTCHA scores
    // 0.0 = bot, 1.0 = human; conservative until we see real distribution.
    managedRules: [{ endScore: 0.5, action: "BLOCK" }],
  },
});

console.log(`✅ reCAPTCHA Enterprise: emailPasswordEnforcementState = ${STATE}`);
console.log("   managedRules:", JSON.stringify(config.recaptchaConfig?.managedRules ?? []));
