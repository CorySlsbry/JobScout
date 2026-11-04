"use client";

// Tiny copy-to-clipboard button used on /referrals next to the refer link.

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export default function ReferralCopyButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {/* fall through silently */}
  }

  return (
    <button
      onClick={copy}
      className="btn-cosmic inline-flex items-center gap-1.5 px-3 py-2 text-xs shrink-0"
      aria-label="Copy refer link"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
