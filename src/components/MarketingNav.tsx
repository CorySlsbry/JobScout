import Link from "next/link";
import { Logo } from "./Logo";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border-soft)] bg-[var(--bg)]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-7 text-sm text-[var(--muted)] sm:flex">
          <Link href="/#features" className="hover:text-[var(--fg)] transition-colors">Features</Link>
          <Link href="/pricing"   className="hover:text-[var(--fg)] transition-colors">Pricing</Link>
          <Link href="/#faq"      className="hover:text-[var(--fg)] transition-colors">FAQ</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/signin" className="hidden text-sm text-[var(--muted)] hover:text-[var(--fg)] sm:block">
            Sign in
          </Link>
          <Link href="/signup" className="btn-cosmic text-sm">Start free</Link>
        </div>
      </div>
    </header>
  );
}
