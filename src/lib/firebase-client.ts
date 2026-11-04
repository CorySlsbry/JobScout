// Firebase Auth client SDK init (browser only).
//
// Required env vars (all NEXT_PUBLIC_*, baked at build time):
//   NEXT_PUBLIC_FIREBASE_API_KEY
//   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
//   NEXT_PUBLIC_FIREBASE_PROJECT_ID
//   NEXT_PUBLIC_FIREBASE_APP_ID
//
// Get them from: Firebase console → Project settings → General → Your apps → Web app config
// (If no web app yet, click "Add app" → Web → register a nickname).

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  initializeRecaptchaConfig,
  type Auth,
} from "firebase/auth";

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let recaptchaInitialized = false;

export function getFirebaseAuth(): Auth | null {
  if (typeof window === "undefined") return null;

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;

  if (!cachedApp) {
    cachedApp = getApps()[0] ?? initializeApp({
      apiKey,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
  if (!cachedAuth) {
    cachedAuth = getAuth(cachedApp);
    // Survive page refresh.
    setPersistence(cachedAuth, browserLocalPersistence).catch(() => { /* fine, defaults work */ });

    // Pull the project's reCAPTCHA Enterprise config so signup/signin/reset
    // get auto-protected. Server-side enforcement state is set via
    // scripts/setup-recaptcha.mjs (AUDIT → ENFORCE once metrics look clean).
    if (!recaptchaInitialized) {
      recaptchaInitialized = true;
      initializeRecaptchaConfig(cachedAuth).catch((err) => {
        console.warn("[firebase-client] initializeRecaptchaConfig failed:", err?.message ?? err);
      });
    }
  }
  return cachedAuth;
}

export function isFirebaseAuthConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
}
