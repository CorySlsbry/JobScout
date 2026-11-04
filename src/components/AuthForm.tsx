"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Phone, AlertCircle, Loader2 } from "lucide-react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  updateProfile as updateAuthProfile,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth, isFirebaseAuthConfigured } from "@/lib/firebase-client";
import { Logo } from "@/components/Logo";

type Mode = "signin" | "signup";

// Firebase error codes where the popup flow failed for environmental reasons
// (blockers, in-app webviews, automation, mobile) — we transparently retry via
// full-page redirect, which doesn't depend on popups or third-party cookies.
const POPUP_FALLBACK_CODES = [
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
];

const REDIRECT_FLAG = "jobscout_google_redirect";   // sessionStorage marker

// Read `jobscout_refer_code` cookie (set on landing when ?ref=XYZ is present).
function readReferCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)jobscout_refer_code=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const configured = isFirebaseAuthConfigured();

  // ?intent=pro|boost — set by the landing/pricing Pro/Boost CTAs. We pass
  // it through to /onboarding so the form can chain into Stripe checkout
  // on successful onboarding submit.
  const intent = searchParams?.get("intent");
  const intentSuffix = intent && (intent === "pro" || intent === "boost") ? `?intent=${intent}` : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // True while we're completing a Google sign-in that came back via full-page
  // redirect (the popup-fallback path). Shows a "finishing sign-in" overlay.
  const [resolvingRedirect, setResolvingRedirect] = useState(false);

  async function exchangeCookie(idToken: string) {
    const r = await fetch("/api/auth/session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j as { error?: string }).error ?? "session_failed");
    }
  }

  async function persistProfileExtras(uid: string, displayName: string, phoneNumber: string) {
    // Phone isn't on the Firebase ID token unless verified via SMS. We persist
    // the user's typed phone to their profile as well.
    // is_signup=true triggers the welcome email + referral claim server-side.
    await fetch("/api/profile/onboarding", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid,
        full_name: displayName || undefined,
        phone: phoneNumber || undefined,
        refer_code: readReferCookie() || undefined,
        is_signup: true,
      }),
    }).catch(() => { /* best-effort, profile gets created lazily anyway */ });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const auth = getFirebaseAuth();
    if (!auth) { setError("Firebase Auth isn't configured. See Settings → Connections."); setBusy(false); return; }

    try {
      let cred;
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Please enter your full name.");
        if (phone.replace(/\D/g, "").length < 10) throw new Error("Please enter a valid phone number.");
        cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) await updateAuthProfile(cred.user, { displayName: name.trim() });
      } else {
        cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      const idToken = await cred.user.getIdToken(true);
      await exchangeCookie(idToken);
      if (mode === "signup") {
        await persistProfileExtras(cred.user.uid, name.trim(), phone.trim());
      }
      router.push(mode === "signup" ? `/onboarding${intentSuffix}` : "/feed");
      router.refresh();
    } catch (e: unknown) {
      setError(humanizeFirebaseError(e));
    } finally {
      setBusy(false);
    }
  }

  // Shared post-credential flow for BOTH the popup result and the redirect
  // result: mint the session cookie, seed the profile on first sight, route.
  async function finishGoogle(cred: UserCredential) {
    const idToken = await cred.user.getIdToken(true);
    await exchangeCookie(idToken);
    // First sign-in? Approx via metadata (creation == last-sign-in).
    const isNew = cred.user.metadata.creationTime === cred.user.metadata.lastSignInTime;
    if (isNew) {
      await persistProfileExtras(cred.user.uid, cred.user.displayName ?? "", cred.user.phoneNumber ?? "");
    }
    router.push(isNew ? `/onboarding${intentSuffix}` : "/feed");
    router.refresh();
  }

  // On mount: if we just came back from a redirect-based Google sign-in,
  // complete it. getRedirectResult resolves with the credential on return,
  // or null if this load wasn't a redirect return.
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    let cancelled = false;
    const flagged = typeof sessionStorage !== "undefined" && sessionStorage.getItem(REDIRECT_FLAG) === "1";
    if (flagged) setResolvingRedirect(true);
    getRedirectResult(auth)
      .then(async (result) => {
        try { sessionStorage.removeItem(REDIRECT_FLAG); } catch {}
        if (cancelled || !result) { if (!cancelled) setResolvingRedirect(false); return; }
        try {
          await finishGoogle(result);
        } catch (e) {
          if (!cancelled) { setError(humanizeFirebaseError(e)); setResolvingRedirect(false); }
        }
      })
      .catch((e) => {
        try { sessionStorage.removeItem(REDIRECT_FLAG); } catch {}
        if (!cancelled) { setError(humanizeFirebaseError(e)); setResolvingRedirect(false); }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function google() {
    setBusy(true);
    setError(null);
    const auth = getFirebaseAuth();
    if (!auth) { setError("Firebase Auth isn't configured."); setBusy(false); return; }
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      await finishGoogle(cred);
    } catch (e: unknown) {
      const code = e instanceof Error && "code" in e ? String((e as { code: string }).code) : "";
      if (POPUP_FALLBACK_CODES.includes(code)) {
        // Popup unavailable (blocker / in-app browser / automation / mobile).
        // Fall back to a full-page redirect — works everywhere.
        try {
          try { sessionStorage.setItem(REDIRECT_FLAG, "1"); } catch {}
          setResolvingRedirect(true);
          await signInWithRedirect(auth, provider);
          return;   // browser navigates away; getRedirectResult finishes on return
        } catch (re: unknown) {
          try { sessionStorage.removeItem(REDIRECT_FLAG); } catch {}
          setResolvingRedirect(false);
          setError(humanizeFirebaseError(re));
        }
      } else {
        setError(humanizeFirebaseError(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-aurora min-h-screen flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-block"><Logo size="lg" /></div>
          <h1 className="font-[family-name:var(--font-inter-tight)] mt-4 text-3xl font-bold tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {mode === "signup"
              ? "Free forever — no card needed. Pro is $20/mo when you're ready."
              : "Sign in to continue your hunt."}
          </p>
        </div>

        {resolvingRedirect && (
          <div className="mb-4 rounded-xl border border-[var(--accent-2)]/40 bg-[var(--accent-2-soft)] p-3 text-sm text-[var(--accent-2)] flex items-center gap-2">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span>Finishing Google sign-in…</span>
          </div>
        )}

        {!configured && (
          <div className="mb-4 rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3 text-sm text-[var(--warn)] flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Auth not configured yet</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Enable Firebase Auth in console.firebase.google.com → Authentication, then set the four NEXT_PUBLIC_FIREBASE_* env vars on Cloud Run.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="glass rounded-2xl p-5 space-y-3">
          {mode === "signup" && (
            <Field icon={<User size={16} />}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
                autoComplete="name" required className="flex-1 bg-transparent outline-none" />
            </Field>
          )}
          <Field icon={<Mail size={16} />}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com"
              autoComplete="email" required className="flex-1 bg-transparent outline-none" />
          </Field>
          {mode === "signup" && (
            <Field icon={<Phone size={16} />}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="(555) 123-4567"
                autoComplete="tel" required className="flex-1 bg-transparent outline-none" />
            </Field>
          )}
          <Field icon={<Lock size={16} />}>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
              placeholder={mode === "signup" ? "Set a password (≥ 8 chars)" : "Password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : 1} required className="flex-1 bg-transparent outline-none" />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-[var(--bad)]/40 bg-[var(--bad-soft)] p-2.5 text-xs text-[var(--bad)]">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" disabled={busy || !configured}
            className="btn-cosmic w-full inline-flex items-center justify-center gap-2 disabled:opacity-50">
            {busy ? <><Loader2 size={16} className="animate-spin" /> {mode === "signup" ? "Creating…" : "Signing in…"}</> :
              mode === "signup" ? "Create account →" : "Sign in →"}
          </button>

          <div className="relative my-1">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--border)]" />
            <span className="relative inline-block bg-[var(--bg-elev)] px-2 text-[10px] uppercase tracking-widest text-[var(--muted)] left-1/2 -translate-x-1/2">or</span>
          </div>

          <button type="button" onClick={google} disabled={busy || !configured || resolvingRedirect}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-5 py-3 text-sm font-medium hover:border-[var(--accent-2)] disabled:opacity-50">
            {resolvingRedirect
              ? <><Loader2 size={16} className="animate-spin" /> Finishing sign-in…</>
              : <><GoogleG /> Continue with Google</>}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--muted)]">
          {mode === "signup" ? (
            <>Already have an account? <Link href="/signin" className="text-[var(--accent-2)] hover:underline">Sign in →</Link></>
          ) : (
            <>New here? <Link href="/signup" className="text-[var(--accent-2)] hover:underline">Create an account →</Link></>
          )}
        </p>
        <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
          By continuing you agree to our{" "}
          <Link href="/terms" className="hover:text-[var(--fg)] underline decoration-[var(--accent-2)]/40">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="hover:text-[var(--fg)] underline decoration-[var(--accent-2)]/40">Privacy Policy</Link>.
          We never sell your resume. Cancel anytime.
        </p>
      </div>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-3 py-2.5 focus-within:border-[var(--accent-2)] transition-colors">
      <span className="text-[var(--muted)] shrink-0">{icon}</span>
      {children}
    </label>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 3l5.7-5.7C33.8 6.1 29.2 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 18.9 13 24 13c3 0 5.7 1.1 7.8 3l5.7-5.7C33.8 6.1 29.2 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5.1c-2 1.5-4.5 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8l-6.6 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.1 5.1C40.5 36.1 44 30.6 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function humanizeFirebaseError(e: unknown): string {
  if (!(e instanceof Error)) return "Something went wrong.";
  const msg = e.message;
  if (msg.includes("auth/email-already-in-use")) return "Email already registered. Try signing in instead.";
  if (msg.includes("auth/invalid-email")) return "That email doesn't look right.";
  if (msg.includes("auth/weak-password")) return "Password too weak. Use at least 8 characters.";
  if (msg.includes("auth/wrong-password") || msg.includes("auth/invalid-credential")) return "Wrong email or password.";
  if (msg.includes("auth/user-not-found")) return "No account with that email.";
  if (msg.includes("auth/too-many-requests")) return "Too many attempts. Try again in a minute.";
  if (msg.includes("auth/popup-closed-by-user") || msg.includes("auth/cancelled-popup-request")) return "Sign-in window closed before finishing. Trying a full-page redirect instead — tap Continue with Google again if it doesn't proceed.";
  if (msg.includes("auth/popup-blocked")) return "Your browser blocked the sign-in popup. Retrying with a redirect — tap Continue with Google again.";
  if (msg.includes("auth/unauthorized-domain")) return "This domain isn't authorized for sign-in yet. (Admin: add it in Firebase Auth → Settings → Authorized domains.)";
  if (msg.includes("auth/account-exists-with-different-credential")) return "You already have an account with this email using a different sign-in method. Use that method, or sign in with email + password.";
  if (msg.includes("auth/network-request-failed")) return "Network hiccup talking to the auth server. Check your connection and try again.";
  if (msg.includes("auth/operation-not-allowed")) return "Google sign-in isn't enabled in Firebase yet. Open the Firebase console → Authentication → Sign-in method and turn it on.";
  return msg.replace(/^Firebase: /, "");
}
