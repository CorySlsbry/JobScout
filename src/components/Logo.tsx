import Link from "next/link";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  return (
    <Link href="/" className={`flex items-center gap-2 font-[family-name:var(--font-inter-tight)] font-bold tracking-tight ${cls}`}>
      <span aria-hidden="true" className="relative inline-flex h-7 w-7 items-center justify-center rounded-xl"
        style={{ background: "var(--grad-cosmic)" }}>
        <span className="absolute inset-0 rounded-xl opacity-40 blur-md" style={{ background: "var(--grad-cosmic)" }} />
        <span className="relative text-white text-sm">★</span>
      </span>
      <span><span className="grad-text">Job</span>Scout</span>
    </Link>
  );
}
