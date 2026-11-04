"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Send } from "lucide-react";
import { subscribePush, unsubscribePush, sendTestNotification } from "@/app/actions";

// SSR-safe subscription: the browser's support for push is a runtime property
// that doesn't change after first read. useSyncExternalStore gives us the
// value during render without triggering the React 19 set-state-in-effect lint.
function checkSupport(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "PushManager" in window;
}
// useSyncExternalStore needs a subscribe fn but push-support never changes
// at runtime, so this is a no-op that returns an empty unsubscribe.
function subscribeSupport() { return () => {}; }
function usePushSupport(): boolean {
  return useSyncExternalStore(subscribeSupport, checkSupport, () => false);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export default function PushSubscribeCard({
  vapidPublicKey,
  hasSubscription,
}: {
  vapidPublicKey: string;
  hasSubscription: boolean;
}) {
  const supported = usePushSupport();
  const [subscribed, setSubscribed] = useState(hasSubscription);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Register the service worker once on mount when the browser supports it.
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((e) => console.error("SW register failed:", e));
  }, [supported]);

  async function subscribe() {
    if (!vapidPublicKey) {
      setMsg("Set NEXT_PUBLIC_VAPID_PUBLIC_KEY first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      const json = JSON.parse(JSON.stringify(sub));
      await subscribePush(json);
      setSubscribed(true);
      setMsg("Subscribed. You'll get notifications for new high-match jobs.");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setMsg(`Failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      await sub?.unsubscribe();
      await unsubscribePush();
      setSubscribed(false);
      setMsg("Unsubscribed.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    const r = await sendTestNotification();
    setMsg(r.ok ? "Test sent." : `Failed: ${r.error}`);
    setBusy(false);
  }

  if (supported === false) {
    return (
      <section className="glass rounded-2xl p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Push notifications</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Not supported in this browser. Install JobScout to your home screen on iOS 16.4+ or use Chrome/Firefox.
        </p>
      </section>
    );
  }

  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">Push notifications</h2>
      <p className="mt-2 text-sm">
        Get a ping on your phone the moment a high-match job hits the feed (Remote ≥ $150k or any St George role).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!subscribed ? (
          <button
            onClick={subscribe}
            disabled={busy || !vapidPublicKey}
            className="btn-cosmic inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Bell size={16} /> Enable on this device
          </button>
        ) : (
          <>
            <button
              onClick={test}
              disabled={busy}
              className="btn-cosmic inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send size={16} /> Send test
            </button>
            <button
              onClick={unsubscribe}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] font-semibold px-4 py-2.5 disabled:opacity-50"
            >
              <BellOff size={16} /> Unsubscribe
            </button>
          </>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-[var(--muted)]">{msg}</p>}
      {!vapidPublicKey && (
        <p className="mt-2 text-xs text-[var(--warn)]">
          Run <code className="font-mono">npx web-push generate-vapid-keys</code> and set
          <code className="font-mono"> NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> +
          <code className="font-mono"> VAPID_PRIVATE_KEY</code> in <code className="font-mono">.env.local</code>.
        </p>
      )}
    </section>
  );
}
