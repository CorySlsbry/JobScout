// Privacy Policy. Scoped to JobScout's actual data flows: Firebase Auth,
// Firestore, Anthropic API, Stripe, Gmail readonly+modify, Cloud Run.
// NOT legal advice — have an attorney review before scaling.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy · JobScout",
  description: "How JobScout collects, uses, and protects your data.",
};

const LAST_UPDATED = "May 20, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-20 flex items-center gap-3 bg-[var(--bg)]/85 backdrop-blur-xl px-4 sm:px-6 py-3 border-b border-[var(--border-soft)]">
        <Link href="/" className="rounded-full p-1.5 hover:bg-[var(--bg-elev)] text-[var(--muted)] hover:text-[var(--fg)]" aria-label="Back">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-[family-name:var(--font-inter-tight)] text-base font-bold">Privacy Policy</h1>
      </header>

      <article className="prose mx-auto max-w-3xl px-4 sm:px-6 py-10 prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-p:text-[var(--fg)]/90 prose-li:text-[var(--fg)]/90 prose-a:text-[var(--accent-2)]">
        <p className="text-sm text-[var(--muted)]">Last updated: {LAST_UPDATED}</p>

        <p>
          This Privacy Policy explains what data JobScout collects, how we use it, who we share it with,
          and the controls you have. We tried to write it in plain English. If anything is unclear, email
          us at <a href="mailto:cory.salisbury@gmail.com">cory.salisbury@gmail.com</a>.
        </p>

        <h2>1. Data we collect</h2>
        <p>To run the Service for you, we collect and store:</p>
        <ul>
          <li><strong>Account data:</strong> email, display name (from Firebase Auth or Google sign-in), Firebase UID, last-seen timestamp.</li>
          <li><strong>Profile data:</strong> what you enter into Settings &mdash; salary floor, location preferences, keywords, career story, growth goals, what to avoid, calibration prompts.</li>
          <li><strong>Resumes:</strong> the markdown/text content of every resume you upload or paste, plus the original filename.</li>
          <li><strong>Job-search data:</strong> scored jobs, your saved/applied/dismissed status on each, your interview stories, your uploaded assessment results, your Upwork leads pre-drafted by the inbox watcher.</li>
          <li><strong>Gmail data (Pro/Boost only, opt-in):</strong> when you connect Gmail, we read messages matching narrow queries (typically <code>from:upwork.com newer_than:2d</code>). We extract job listings from those emails, score and pre-draft proposals, and apply a <code>JobScout/Processed</code> label so the same message isn&rsquo;t processed twice. <strong>We do not read your inbox broadly. We never send, modify, or delete email on your behalf.</strong> Your OAuth refresh token is stored encrypted in our database.</li>
          <li><strong>Billing data (paid tiers):</strong> Stripe Customer ID and Subscription ID. Card numbers are stored only by Stripe and never touch our servers.</li>
          <li><strong>Usage telemetry:</strong> per-user counters of metered actions (jobs scored, tailors run, etc.) used for free-tier rate-limiting and product analytics. Coarse IP-based geographic data from server logs.</li>
        </ul>

        <h2>2. How we use it</h2>
        <p>We use the data above only to:</p>
        <ul>
          <li>Operate the Service for you &mdash; score jobs against your profile, generate tailored resumes and cover letters, draft Upwork proposals, look up comp benchmarks.</li>
          <li>Enforce free-tier quotas and paid-tier access.</li>
          <li>Send transactional emails &mdash; welcome, password reset, billing receipts, weekly digest if you opt in.</li>
          <li>Diagnose bugs and improve the Service (aggregated only).</li>
          <li>Comply with legal obligations (billing records, fraud prevention).</li>
        </ul>
        <p>
          <strong>We never sell your data.</strong> We never share your resume or career details with third parties for marketing.
          We do not use your content to train general AI models.
        </p>

        <h2>3. Service providers</h2>
        <p>JobScout runs on third-party infrastructure. These providers process data strictly on our behalf:</p>
        <ul>
          <li><strong>Google Cloud / Firebase</strong> &mdash; auth, database (Firestore), hosting (Cloud Run), scheduling.</li>
          <li><strong>Anthropic</strong> &mdash; the Claude API generates scores, tailored resumes, cover letters, and proposals. Anthropic&rsquo;s API privacy policy states inputs and outputs are not used to train models for API customers.</li>
          <li><strong>Stripe</strong> &mdash; payment processing; PCI-DSS compliant.</li>
          <li><strong>Google Workspace / Gmail API</strong> &mdash; only if you opt in to the inbox watcher; the scope is <code>gmail.modify</code> on your account.</li>
          <li><strong>SMTP relay</strong> for transactional email.</li>
        </ul>

        <h2>4. Data location and retention</h2>
        <p>
          Servers are hosted in Google Cloud&rsquo;s <code>us-west1</code> region. Firestore data is replicated within
          that region for durability. We retain your data while your account is active. On account deletion we
          remove your resumes, profile, applications, leads, stories, and assessments within 30 days. Billing
          records (Stripe-side) and aggregated, anonymized usage logs may be retained longer for legal and
          analytical purposes.
        </p>

        <h2>5. Your rights</h2>
        <p>You can at any time:</p>
        <ul>
          <li><strong>Access</strong> your data &mdash; Settings exposes everything we store.</li>
          <li><strong>Correct</strong> it &mdash; same place.</li>
          <li><strong>Export</strong> it &mdash; resumes download as Markdown/PDF/DOCX; we&rsquo;ll provide a JSON dump of the rest on request.</li>
          <li><strong>Delete</strong> your account &mdash; Settings &rarr; Account &rarr; Delete. This is irreversible.</li>
          <li><strong>Revoke Gmail access</strong> from <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">your Google account permissions page</a>.</li>
          <li><strong>Cancel billing</strong> from Settings &rarr; Billing &rarr; Manage (Stripe Billing Portal).</li>
        </ul>
        <p>
          California (CCPA), EU (GDPR), and other residents have additional rights including data portability
          and the right to object to processing. Email <a href="mailto:cory.salisbury@gmail.com">cory.salisbury@gmail.com</a>
          with &ldquo;privacy request&rdquo; in the subject line and we&rsquo;ll respond within 30 days.
        </p>

        <h2>6. Security</h2>
        <p>
          We use HTTPS for all traffic, Firebase Auth for session management, server-side admin SDK for
          Firestore writes (no client-side direct DB access), bcrypt-equivalent hashing for stored secrets
          (extension tokens are sha-256 hashed; we never store plaintext). No system is perfectly secure.
          If you discover a vulnerability, please email
          <a href="mailto:cory.salisbury@gmail.com">cory.salisbury@gmail.com</a> with &ldquo;security&rdquo; in the subject.
        </p>

        <h2>7. Children</h2>
        <p>JobScout is not directed to children under 18. We do not knowingly collect data from minors.</p>

        <h2>8. Cookies</h2>
        <p>
          We use one essential cookie (<code>jobscout_session</code>) to keep you signed in. We do not use
          tracking, advertising, or analytics cookies.
        </p>

        <h2>9. Changes</h2>
        <p>
          Material updates to this Policy will be announced via email and an in-app banner at least 30 days
          before they take effect.
        </p>

        <h2>10. Contact</h2>
        <p>
          Privacy questions, exports, or deletions: <a href="mailto:cory.salisbury@gmail.com">cory.salisbury@gmail.com</a>.
        </p>

        <p className="text-xs text-[var(--muted)] mt-12">
          This Policy is a baseline tailored to JobScout&rsquo;s current data flows. Have an attorney review
          before scaling internationally or onboarding enterprise customers.
        </p>
      </article>
    </div>
  );
}
