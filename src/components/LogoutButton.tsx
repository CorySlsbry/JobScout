"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function LogoutButton({
  className = "",
  showLabel = true,
}: { className?: string; showLabel?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function logout() {
    start(async () => {
      // Clear server-side cookie first so the next request lands on /signin.
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      // Then clear client-side Firebase state.
      const auth = getFirebaseAuth();
      try { await auth?.signOut(); } catch { /* fine */ }
      router.replace("/signin");
      router.refresh();
    });
  }

  return (
    <button
      onClick={logout}
      disabled={pending}
      title="Sign out"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] px-2.5 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--bad)] hover:border-[var(--bad)]/40 disabled:opacity-50 ${className}`}
    >
      <LogOut size={13} /> {showLabel && (pending ? "Signing out…" : "Log out")}
    </button>
  );
}
