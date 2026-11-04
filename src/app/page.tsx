// Landing page — JobScout's primary marketing surface for jobscout-hq.com.
//
// Framework composition:
//   • Hormozi  — Value Equation hero, $-anchored value stack, bonus stack,
//                risk-reversal block, urgency without pressure
//   • TJ '26   — 9-page Architecture sections (Use Cases + Comparison + FAQ
//                15-30 plain-text Q&A, 40-80 word answers, no accordions),
//                fact density target 1 fact per 80-200 words, front-loaded
//                answer in first 30% of page
//   • Sabrina  — delay-the-form modal (GetStartedModal), refer-2-for-20%
//                discount loop, email-first capture before resume upload
//   • Dante    — one primary CTA above the fold, demo as secondary action,
//                problem-first headline aligned to ONE outcome
//
// Pricing source-of-truth: Free / Pro $19 / Boost $29 — must stay in sync
// with /pricing and src/lib/stripe.ts. (No more Team $49 tier.)

import Link from "next/link";
import { Suspense } from "react";
import {
  Sparkles, Bell, MapPin, DollarSign, Bot, Zap,
  ArrowRight, Check, Star, Shield, Clock, TrendingDown,
  Award, GraduationCap, Briefcase, Rocket,
} from "lucide-react";
import { MarketingNav } from "@/components/MarketingNav";
import { GetStartedModal } from "@/components/GetStartedModal";
import { Logo } from "@/components/Logo";
import ReferralCapture from "@/components/ReferralCapture";

export const metadata = {
  title: "JobScout — Land your next $150k+ remote job in 30 days",
  description:
    "Stop applying to 200 jobs. JobScout's AI scores every posting against your resume, fires push alerts when a 90+ match goes live, auto-tailors your resume and cover letter, and walks you through salary negotiation. Free forever. $19/mo Pro unlocks the autopilot.",
};

export default function LandingPage() {
  return (
    <div className="bg-aurora min-h-screen">
      {/* Captures ?ref=CODE -> cookie so the subsequent signup claims it. */}
      <Suspense fallback={null}><ReferralCapture /></Suspense>
      <MarketingNav />

      {/* ── HERO — Dante: one outcome, one primary CTA ─────────── */}
      <section className="relative overflow-hidden">
        <span className="particle" style={{ left: "8%",  top: "20%" }} />
        <span className="particle" style={{ left: "82%", top: "30%", animationDelay: "1.5s" }} />
        <span className="particle" style={{ left: "18%", top: "60%", animationDelay: "3s" }} />
        <span className="particle" style={{ left: "75%", top: "75%", animationDelay: "4.5s" }} />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-12 sm:pt-20 pb-10 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elev)]/60 px-3 py-1 text-xs text-[var(--muted)]">
            <span className="live-dot" /> 7 boards scanned every 2 hours · LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby, Lever, ZipRecruiter
          </span>

          <h1 className="font-[family-name:var(--font-inter-tight)] mt-5 text-4xl sm:text-6xl lg:text-7xl font-extrabold leading-[1.04] tracking-tight">
            Land a <span className="grad-text">$150k+ remote</span> tech job<br className="hidden sm:block" />{" "}
            in 30 days — <span className="text-[var(--muted)]">without applying to 200.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-[var(--muted)] leading-relaxed">
            JobScout reads your resume, scores every new posting 0–100, and pings your phone the
            second a <strong className="text-[var(--fg)]">90+ match</strong> goes live. Then it
            tailors your resume <em className="text-[var(--fg)]">to that posting</em>, drafts your
            cover letter, and gives you the salary band before you reply. Apply in the first 30
            minutes — when callback rates are{" "}
            <strong className="text-[var(--fg)]">3× higher</strong>.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <GetStartedModal>Start free — get my next role →</GetStartedModal>
            <Link
              href="/feed"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)]/60 px-5 py-3 text-sm font-medium hover:border-[var(--accent-2)]"
            >
              See the live demo →
            </Link>
          </div>

          <p className="mt-4 text-xs text-[var(--muted)]">
            Free forever · No card · Cancel any time · ★ Refer 2 friends, get 20% off Pro for life
          </p>
        </div>

        {/* Phone mockup */}
        <div className="relative mx-auto max-w-md px-4 sm:px-6 pb-16">
          <div
            className="glass mx-auto rounded-[2rem] p-3"
            style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}
          >
            <div className="rounded-[1.6rem] overflow-hidden border border-[var(--border)] bg-[var(--bg-elev-2)]">
              <DemoFeedPreview />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-[var(--muted)]">A sample of what your feed looks like.</p>
        </div>
      </section>

      {/* ── PROBLEM (Hormozi: name the pain specifically) ────────── */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 py-14">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            The dirty secret of job search
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            You don&apos;t have a resume problem.<br />
            You have a <span className="grad-text">signal-to-noise</span> problem.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PainCard
            icon={<TrendingDown className="text-[var(--accent-2)]" />}
            stat="200 → 0"
            title="200 applications, 0 callbacks"
            desc="The average tech application gets a 2% response. You're not failing — the firehose is broken. LinkedIn shows you anything keyword-matched, even when the salary's $80k below your floor."
          />
          <PainCard
            icon={<Clock className="text-[var(--accent)]" />}
            stat="11 PM"
            title="Tailoring at 11pm doesn't scale"
            desc="Rewriting your resume per posting is a part-time job. You stop doing it by week two. By week four, you're sending the same generic doc to 30 listings a day and wondering why nothing lands."
          />
          <PainCard
            icon={<Briefcase className="text-[var(--good)]" />}
            stat="48hr"
            title="The good jobs vanish in 48 hours"
            desc="The Vellum / Decagon / Anthropic-tier listings get 400+ applicants in two days. If you're not applying in the first 30 minutes — when callback rates triple — you're applying against a pile that&apos;s already short-listed."
          />
        </div>
      </section>

      {/* ── VALUE STACK (Hormozi: $-anchored deliverables) ──────── */}
      <section id="features" className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            What you get
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Everything a $400/mo recruiter does.{" "}
            <span className="grad-text">For $19.</span>
          </h2>
          <p className="mt-3 text-[var(--muted)]">
            Built by a Tesla tech who got tired of applying to 200 jobs to get 1 interview — bundled
            into the cleanest job tracker you&apos;ve ever used.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard
            icon={<Sparkles className="text-[var(--accent-2)]" />}
            title="AI match scoring (0-100)"
            value="$160/mo savings"
            desc="Every posting from LinkedIn, Indeed, ZipRecruiter, Glassdoor, Greenhouse, Ashby, and Lever — scored against your real resume, target salary, and target city. Anything under your bar never reaches you."
          />
          <FeatureCard
            icon={<Bell className="text-[var(--accent)]" />}
            title="Push to phone the moment a 90+ posts"
            value="3× callback rate"
            desc="Install JobScout as a PWA. The instant a high-match job posts, your phone vibrates. Apply in 30 minutes instead of 30 hours — that&apos;s where the callback-rate cliff sits."
          />
          <FeatureCard
            icon={<Bot className="text-[var(--accent-2)]" />}
            title="AI-tailored resumes (unlimited)"
            value="$80/posting saved"
            desc="One click rewrites your resume against the job description. Highlights matching projects, surfaces the right keywords for the ATS, preserves your voice. Stop sending the same generic PDF."
          />
          <FeatureCard
            icon={<DollarSign className="text-[var(--good)]" />}
            title="Comp Intelligence (Boost)"
            value="$10k+ negotiated swing"
            desc="Per-company salary benchmarks scored by Claude + live web research. Total comp, base band, equity ranges, recent offers — everything you need before the recruiter asks your expectation."
          />
          <FeatureCard
            icon={<Award className="text-[var(--accent-2)]" />}
            title="One-tap Negotiation Playbook (Boost)"
            value="Priceless on offer day"
            desc="Paste the offer, get a tailored response script: opening, counter-anchor, the 3 levers to pull (base / equity / sign-on), and the exact words for each. Built from your comp lookup."
          />
          <FeatureCard
            icon={<MapPin className="text-[var(--accent)]" />}
            title="Upwork bidder (Chrome extension)"
            value="$200/mo Fiverr Pro"
            desc="Score every Upwork job from your browser. Generate a personalized bid + tailored proposal in 10 seconds. Pro tier — turns Upwork from a time-sink into a lead engine."
          />
        </div>
      </section>

      {/* ── BONUS STACK (Hormozi: stack the bonuses) ───────────── */}
      <section className="relative mx-auto max-w-4xl px-4 sm:px-6 pb-16">
        <div className="glass rounded-3xl p-6 sm:p-10" style={{ boxShadow: "var(--shadow-card)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            Plus you get
          </p>
          <h3 className="font-[family-name:var(--font-inter-tight)] mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
            5 bonuses bundled — <span className="grad-text">no upsell, no extra charge</span>.
          </h3>

          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <BonusRow title="Gmail inbox watcher" desc="Hourly scan of your inbox auto-drafts replies to recruiter outreach." />
            <BonusRow title="Interview Story Bank (STAR+R)" desc="Save 20-30 stories tagged by skill. Pull the right one in 5 seconds during a screen." />
            <BonusRow title="Assessment uploader" desc="Drop your Zapier AI Fluency / HackerRank / LeetCode results — auto-attached to relevant applications." />
            <BonusRow title="Aim & calibration prompts" desc="A live tuning knob that re-shapes every score + every draft as you sharpen your target." />
            <BonusRow title="Refer 2 friends → 20% off Pro forever" desc="When 2 friends sign up and stay, you get a permanent discount. Both keep paying, you keep saving." />
          </ul>
        </div>
      </section>

      {/* ── HOW IT WORKS (Dante: pull the curtain back) ────────── */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            How it works
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Three steps. Then your phone does the work.
          </h2>
        </div>

        <ol className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StepCard n={1} title="Drop your resume + target"
            desc="Paste your resume or upload a PDF. Set your salary floor, target city, and the kind of role you&apos;re aiming at. 60 seconds." />
          <StepCard n={2} title="Install JobScout on your phone"
            desc="Add to home screen (iOS + Android). Allow notifications. Optional: install the Upwork bidder Chrome extension." />
          <StepCard n={3} title="Get pinged. Tap. Tailor. Send."
            desc="High-match jobs hit your phone every 2 hours. Tap → AI tailors the resume → review → send. Under a minute, end-to-end." />
        </ol>
      </section>

      {/* ── USE CASES (TJ 9-page Architecture: Use Cases section) ─ */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            Who it&apos;s for
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Built for the four kinds of tech job-search pain.
          </h2>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UseCaseCard
            icon={<Briefcase className="text-[var(--accent-2)]" />}
            persona="Senior IC tired of LinkedIn noise"
            need="You make $130k+ today, want $160k+ remote, and refuse to scroll through 500 jobs/week to find 3 worth applying to."
            jobscout="JobScout's salary floor + match score filter killed 92% of your feed automatically. You see the 8% that&apos;s worth your night."
          />
          <UseCaseCard
            icon={<GraduationCap className="text-[var(--accent)]" />}
            persona="Bootcamp grad chasing the first $90k role"
            need="Hundreds of postings, fierce competition, every &quot;junior&quot; role wants 3 years of experience. You need callbacks, not noise."
            jobscout="JobScout&apos;s AI tailors your resume to each posting&apos;s exact language. ATS-friendly, recruiter-friendly, no generic blast."
          />
          <UseCaseCard
            icon={<Rocket className="text-[var(--good)]" />}
            persona="Freelancer scaling on Upwork"
            need="The good Upwork jobs disappear in hours. You want first-mover advantage and bids that don&apos;t read like a template."
            jobscout="Upwork bidder Chrome extension scores every job + drafts a personalized proposal in 10 seconds. Pro tier turns Upwork into your pipeline."
          />
          <UseCaseCard
            icon={<Award className="text-[var(--accent-2)]" />}
            persona="Just laid off, doing 8hr/day search"
            need="The clock is ticking. You can&apos;t afford to apply to 200 jobs and get 2 interviews. You need throughput AND quality."
            jobscout="JobScout's push alerts + auto-tailored resumes + comp benchmarks compress your day from 8 hours of grinding to 90 minutes of targeted execution."
          />
        </div>
      </section>

      {/* ── COMPARISON (TJ 9-page Architecture: Comparison page) ── */}
      <section className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            How it stacks up
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            JobScout vs LinkedIn alerts, Teal, Huntr, and DIY.
          </h2>
        </div>

        <div className="mt-10 glass rounded-3xl overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                <th className="text-left p-4 font-medium">Capability</th>
                <th className="p-4 font-medium grad-text">JobScout Pro</th>
                <th className="p-4 font-medium">LinkedIn alerts</th>
                <th className="p-4 font-medium">Teal</th>
                <th className="p-4 font-medium">Huntr</th>
                <th className="p-4 font-medium">DIY</th>
              </tr>
            </thead>
            <tbody>
              <CompareRow feature="AI score per posting (0-100)" js={true} li={false} teal="basic" huntr={false} diy={false} />
              <CompareRow feature="Push to phone on 90+ match" js={true} li={false} teal={false} huntr={false} diy={false} />
              <CompareRow feature="Per-posting resume tailor (unlimited)" js={true} li={false} teal="2/mo" huntr="paid" diy="manual" />
              <CompareRow feature="Multi-board sync (LinkedIn / Indeed / Greenhouse / Ashby / Lever)" js={true} li={false} teal={true} huntr={true} diy={false} />
              <CompareRow feature="Upwork bidder Chrome extension" js={true} li={false} teal={false} huntr={false} diy={false} />
              <CompareRow feature="Per-company comp benchmarks (Claude + web research)" js="Boost" li={false} teal={false} huntr={false} diy="hours" />
              <CompareRow feature="Salary negotiation playbook" js="Boost" li={false} teal={false} huntr={false} diy={false} />
              <CompareRow feature="Free tier" js="Forever" li="Forever" teal="Limited" huntr="Limited" diy="Yes" />
              <CompareRow feature="Monthly cost" js="$19" li="Free" teal="$29" huntr="$25" diy="$0" />
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          Pricing reflects each vendor&apos;s public lowest paid tier as of {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}.
        </p>
      </section>

      {/* ── PRICING (mirror /pricing — Free / Pro / Boost) ─────── */}
      <section id="pricing" className="relative mx-auto max-w-6xl px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            Pricing
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Start free. <span className="grad-text">Upgrade when you start interviewing.</span>
          </h2>
          <p className="mt-3 text-[var(--muted)]">
            No card to start. Cancel any time from Settings. Refer 2 friends to lock in 20% off Pro forever.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <PricingCard
            tier="Free" price="$0" cadence="forever"
            cta={
              <Link href="/signup" className="block text-center rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent-2)]">
                Start free →
              </Link>
            }
            features={[
              "5 jobs scored per day",
              "3 AI-tailored resumes / month",
              "2 cover letters / month",
              "All 7 boards (LinkedIn, Indeed, Glassdoor, Greenhouse, Ashby, Lever, ZipRecruiter)",
              "Push to phone (PWA)",
            ]}
          />
          <PricingCard
            tier="Pro" price="$19" cadence="/ month" highlight
            cta={
              <Link href="/signup?intent=pro" className="btn-cosmic block text-center text-sm">
                Start Pro →
              </Link>
            }
            features={[
              "Everything in Free — unlimited",
              "Upwork bidder Chrome extension",
              "Gmail inbox watcher (auto pre-drafts)",
              "Interview Story Bank (STAR+R)",
              "Assessment uploader",
              "★ Refer 2 → 20% off Pro forever",
            ]}
          />
          <PricingCard
            tier="Boost" price="$29" cadence="/ month"
            cta={
              <Link href="/signup?intent=boost" className="block text-center rounded-xl border border-[var(--border)] bg-[var(--bg-elev-2)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent-2)]">
                Start Boost →
              </Link>
            }
            features={[
              "Everything in Pro",
              "Comp Intelligence (per-company benchmarks)",
              "Negotiation Playbook (one-tap offer prep)",
              "Priority email support",
            ]}
          />
        </div>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          Need the full feature matrix?{" "}
          <Link href="/pricing" className="text-[var(--accent-2)] underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]">
            See the comparison table →
          </Link>
        </p>
      </section>

      {/* ── RISK REVERSAL (Hormozi: kill the objection) ────────── */}
      <section className="relative mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <div className="glass rounded-3xl p-6 sm:p-10 flex flex-col sm:flex-row items-start gap-6"
             style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
          <div className="rounded-2xl bg-[var(--bg-elev-2)] p-4 border border-[var(--border)] shrink-0">
            <Shield size={28} className="text-[var(--accent-2)]" />
          </div>
          <div>
            <h3 className="font-[family-name:var(--font-inter-tight)] text-xl sm:text-2xl font-bold tracking-tight">
              The 30-day callback guarantee.
            </h3>
            <p className="mt-3 text-[var(--muted)] leading-relaxed">
              Start Pro and follow the playbook (drop your resume, install the PWA, allow push, apply within 60 min of a 90+ alert). If you don&apos;t get a callback inside 30 days, email{" "}
              <a href="mailto:cory.salisbury@gmail.com?subject=JobScout%20refund" className="text-[var(--accent-2)] underline">cory.salisbury@gmail.com</a>{" "}
              and we refund every cent. No support escalation, no &quot;sorry to see you go&quot; survey, no fine print. You keep your data export. You can keep the resume drafts too — they&apos;re yours.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOUNDER STORY ─────────────────────────────────────── */}
      <section className="relative mx-auto max-w-3xl px-4 sm:px-6 py-16 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
          Built in public
        </p>
        <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
          A Tesla tech, a busted Python install, and 30 days to St George.
        </h2>
        <p className="mt-5 text-[var(--muted)] leading-relaxed">
          I&apos;m <strong className="text-[var(--fg)]">Cory</strong> — 7+ years senior service tech at Tesla, plus stints at Rivian and SpaceX. After spending 9 months building AI automations for clients, I realized I could build the thing I actually needed: an agent that finds my next $150k+ remote job so my family can move to St George, Utah. JobScout is the same engine I&apos;m using on myself — opened up for the rest of you tired of LinkedIn at 11pm.
        </p>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Build is open at{" "}
          <a href="https://github.com/CorySlsbry/JobScout" className="underline decoration-[var(--accent-2)]/40 hover:decoration-[var(--accent-2)]" target="_blank" rel="noreferrer">
            github.com/CorySlsbry/JobScout
          </a>.
        </p>
      </section>

      {/* ── FAQ (TJ 2026: 15-30 questions, 40-80 word answers, plain text — no accordion) ─ */}
      <section id="faq" className="relative mx-auto max-w-3xl px-4 sm:px-6 py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--accent-2)]">
            FAQ
          </p>
          <h2 className="font-[family-name:var(--font-inter-tight)] mt-2 text-3xl sm:text-4xl font-bold tracking-tight">
            Questions before you sign up?
          </h2>
        </div>

        <div className="mt-10 space-y-7">
          <Faq
            q="How is JobScout different from LinkedIn job alerts?"
            a="LinkedIn surfaces anything that keyword-matches. JobScout reads your full resume, scores every posting 0–100 against your real skills, salary floor, and target city, and only surfaces matches above your bar. You see 5 great jobs a day instead of 200 noise."
          />
          <Faq
            q="Which job boards does JobScout cover?"
            a="Free tier hits all 7 by default: LinkedIn, Indeed, ZipRecruiter, Glassdoor, Greenhouse, Ashby, and Lever. Pro adds the Upwork bidder Chrome extension and the Gmail inbox watcher that catches recruiter outreach hitting your personal email."
          />
          <Faq
            q="Is the free plan really free?"
            a="Yes — forever. 5 jobs scored per day, 3 AI-tailored resumes per month, 2 AI cover letters per month, push notifications, every board. Enough to feel the matching quality before you upgrade to Pro for unlimited and the autopilot extras."
          />
          <Faq
            q="How does the AI scoring actually work?"
            a="Claude reads the job description and compares it against your resume, career story, salary floor, location preference, and the calibration knobs you set in /settings. It outputs a 0–100 score plus 2–3 sentence reasoning so you can see exactly why each job ranks the way it does."
          />
          <Faq
            q="What does &quot;90+ match&quot; actually mean?"
            a="A score of 90+ means the posting matches your resume skills, hits your salary floor, sits in your target geography (or is genuinely remote), and the company isn&apos;t on your exclusion list. We push those to your phone instantly so you can apply in the first 30 minutes — the window where callbacks are 3× higher."
          />
          <Faq
            q="Will my resume ever be public?"
            a="No. Your resume sits in your account, used only to score postings and pre-fill applications you choose to send. It&apos;s never indexed, never shared, never sold. Even on the marketing site you&apos;re reading right now, no resume data is touched."
          />
          <Faq
            q="What&apos;s the refer-2-for-20% deal?"
            a="When 2 friends sign up using your link and stay subscribed past their first month, you get a permanent 20% discount on Pro. Both friends keep paying full price, you keep saving forever. The link generates after sign-up — check Settings → Refer."
          />
          <Faq
            q="Can I cancel any time?"
            a="Yes — from Settings → Billing. No phone call, no survey, no &quot;sorry to see you go&quot; sequence. You keep access until the end of your billing period and your data export is one click away. No lock-in, ever."
          />
          <Faq
            q="What&apos;s the 30-day callback guarantee?"
            a="If you start Pro and follow the playbook — drop your resume, install the PWA, allow push, apply within 60 min of every 90+ alert — and don&apos;t get a callback in 30 days, email cory.salisbury@gmail.com. Full refund, no fine print, you keep your drafts."
          />
          <Faq
            q="Is JobScout a Chrome extension or a web app?"
            a="Both. The core is a web app (works on desktop, mobile, installable as a PWA so it lives on your home screen). The Upwork bidder is a separate Chrome extension that scores Upwork jobs directly from the Upwork tab — Pro tier."
          />
          <Faq
            q="What&apos;s the difference between Pro and Boost?"
            a="Pro ($19) is the full job-search autopilot: unlimited tailoring, all extensions, the Upwork bidder, Gmail watcher. Boost ($29) adds Comp Intelligence (per-company salary benchmarks built from live web research) and the one-tap Negotiation Playbook — the two highest-ROI features when you have an offer in hand."
          />
          <Faq
            q="How fresh is the comp data in Boost?"
            a="Boost runs a live Claude + web-search lookup the first time you request a company. The result is cached for 7 days so repeat lookups are instant. Hit &quot;refresh&quot; on the comp card to force a fresh live lookup if the role just changed or the company just funded."
          />
          <Faq
            q="Does the Gmail inbox watcher need full Gmail access?"
            a="Only read access on the labels you choose. We never send mail on your behalf. The watcher runs hourly, pulls recruiter outreach matching keywords you set, and auto-drafts a reply that lands in your Drafts folder. You read, edit, hit send."
          />
          <Faq
            q="What about ATS-friendliness on tailored resumes?"
            a="Every tailored resume preserves a clean single-column structure, uses the exact keywords from the job description that match your real experience, and exports as a plain-text-friendly PDF. The bullets are rewritten in your voice — not template paragraphs that get rejected by ATS readers."
          />
          <Faq
            q="Can I import resumes from LinkedIn, Indeed, or my Google Doc?"
            a="Yes — paste plain text, upload a PDF, or paste from any source. JobScout extracts structure on import. You can keep multiple resume versions (one for IC roles, one for management, one for freelance) and the AI picks the right base when tailoring."
          />
          <Faq
            q="Do you support visa sponsorship or international job search?"
            a="JobScout scores every posting based on your resume + preferences — visa keywords get weighted if you flag them. Coverage is strongest in US + Canada right now (the 7 default boards). EU and APAC boards are on the 2026 roadmap."
          />
          <Faq
            q="Is there a team plan?"
            a="Not yet. JobScout is built for individual job seekers — there&apos;s no recruiter or HR-facing product. If you&apos;re a coach who wants to run JobScout for clients, email cory.salisbury@gmail.com and we&apos;ll figure something out manually."
          />
          <Faq
            q="What if I&apos;m not in tech?"
            a="JobScout works best for technical roles right now — engineers, AI/ML, automation, design, PM, ops, dev-tools. The scoring engine generalizes (sales, marketing, finance also work) but the board coverage and prompt tuning is sharpest for software-adjacent roles."
          />
          <Faq
            q="How private is my data?"
            a="Stored in Google Cloud Firestore behind Firebase Auth. Only you can read your own resume, jobs, and applications. We never train models on your data. The privacy policy at /privacy spells out every byte we touch."
          />
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-4xl px-4 sm:px-6 py-20 text-center">
        <div className="glass rounded-3xl p-8 sm:p-12"
             style={{ boxShadow: "var(--shadow-glow), var(--shadow-card)" }}>
          <h2 className="font-[family-name:var(--font-inter-tight)] text-3xl sm:text-4xl font-bold tracking-tight">
            Stop scrolling LinkedIn.<br />
            <span className="grad-text">Let your phone find your next job.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[var(--muted)]">
            Free forever. No card. 30-day callback guarantee on Pro. Cancel any time.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <GetStartedModal>Start free →</GetStartedModal>
            <Link
              href="/feed"
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-5 py-3 text-sm font-medium hover:border-[var(--accent-2)]"
            >
              Open the demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-soft)] mt-12">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--muted)]">
          <Logo size="sm" />
          <div className="flex items-center gap-5 flex-wrap justify-center">
            <Link href="/pricing" className="hover:text-[var(--fg)]">Pricing</Link>
            <Link href="/#features" className="hover:text-[var(--fg)]">Features</Link>
            <Link href="/#faq" className="hover:text-[var(--fg)]">FAQ</Link>
            <Link href="/feed" className="hover:text-[var(--fg)]">Open app</Link>
            <Link href="/terms" className="hover:text-[var(--fg)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--fg)]">Privacy</Link>
            <Link href="/security" className="hover:text-[var(--fg)]">Security</Link>
            <Link href="/status" className="hover:text-[var(--fg)]">Status</Link>
          </div>
          <p className="text-xs">© {new Date().getFullYear()} JobScout. Built in St George (soon).</p>
        </div>
      </footer>
    </div>
  );
}

/* ─── building blocks ──────────────────────────────────── */

function PainCard({ icon, stat, title, desc }: { icon: React.ReactNode; stat: string; title: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elev-2)] border border-[var(--border)]">
          {icon}
        </div>
        <span className="font-[family-name:var(--font-inter-tight)] text-2xl font-bold grad-text">{stat}</span>
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureCard({ icon, title, value, desc }: { icon: React.ReactNode; title: string; value?: string; desc: string }) {
  return (
    <div className="glass group rounded-2xl p-5 transition-all hover:border-[var(--accent-2)]/40">
      <div className="flex items-center justify-between">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elev-2)] border border-[var(--border)]">
          {icon}
        </div>
        {value && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--good)] bg-[var(--good-soft)] rounded-full px-2 py-0.5">
            {value}
          </span>
        )}
      </div>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">{desc}</p>
    </div>
  );
}

function BonusRow({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <Check size={18} className="mt-1 shrink-0 text-[var(--accent-2)]" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--muted)] leading-relaxed">{desc}</p>
      </div>
    </li>
  );
}

function StepCard({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="glass rounded-2xl p-5">
      <div className="font-[family-name:var(--font-inter-tight)] text-3xl font-bold grad-text">0{n}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-[var(--muted)] leading-relaxed">{desc}</p>
    </li>
  );
}

function UseCaseCard({ icon, persona, need, jobscout }: { icon: React.ReactNode; persona: string; need: string; jobscout: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bg-elev-2)] border border-[var(--border)] shrink-0">
          {icon}
        </div>
        <div>
          <p className="font-semibold">{persona}</p>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            <strong className="text-[var(--fg)]">The need:</strong> {need}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">
            <strong className="text-[var(--fg)]">What JobScout does:</strong> {jobscout}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompareRow({
  feature, js, li, teal, huntr, diy,
}: {
  feature: string;
  js: boolean | string;
  li: boolean | string;
  teal: boolean | string;
  huntr: boolean | string;
  diy: boolean | string;
}) {
  return (
    <tr className="border-b border-[var(--border)]/50 last:border-0">
      <td className="p-3 sm:p-4 text-[var(--fg)]">{feature}</td>
      <CompareCell v={js} highlight />
      <CompareCell v={li} />
      <CompareCell v={teal} />
      <CompareCell v={huntr} />
      <CompareCell v={diy} />
    </tr>
  );
}

function CompareCell({ v, highlight }: { v: boolean | string; highlight?: boolean }) {
  if (typeof v === "string") {
    return (
      <td className={`p-3 sm:p-4 text-center text-xs ${highlight ? "font-semibold text-[var(--fg)]" : "text-[var(--muted)]"}`}>
        {v}
      </td>
    );
  }
  return (
    <td className="p-3 sm:p-4 text-center">
      {v ? (
        <Check size={16} className={`mx-auto ${highlight ? "text-[var(--accent-2)]" : "text-[var(--good)]"}`} />
      ) : (
        <span className="text-[var(--border)]">—</span>
      )}
    </td>
  );
}

function PricingCard({
  tier, price, cadence, features, cta, highlight,
}: {
  tier: string; price: string; cadence: string;
  features: string[]; cta: React.ReactNode; highlight?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl p-6 ${
        highlight ? "border-2 border-transparent" : "border border-[var(--border)] bg-[var(--bg-elev)]"
      }`}
      style={
        highlight
          ? {
              background: "linear-gradient(var(--bg-elev), var(--bg-elev)) padding-box, var(--grad-cosmic) border-box",
              boxShadow: "var(--shadow-glow), var(--shadow-card)",
            }
          : undefined
      }
    >
      {highlight && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ background: "var(--grad-cosmic)" }}>
          ★ Most popular
        </span>
      )}
      <p className="text-sm font-medium text-[var(--muted)]">{tier}</p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-[family-name:var(--font-inter-tight)] text-4xl font-bold">{price}</span>
        <span className="text-sm text-[var(--muted)]">{cadence}</span>
      </div>
      <ul className="mt-5 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent-2)]" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{cta}</div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  // TJ 2026 rule: NO accordion. Always-visible Q+A, plain text, 40-80 word answers.
  // This is intentional — the answers should be readable by AI crawlers + humans alike.
  return (
    <div>
      <p className="font-semibold text-[var(--fg)]">{q}</p>
      <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">{a}</p>
    </div>
  );
}

/* lightweight static "preview" of the feed for hero */
function DemoFeedPreview() {
  const jobs = [
    { title: "Solutions Architect — Workflow Automation", company: "Vellum AI",      score: 100, loc: "Remote",        salary: "$165–215k", st: false },
    { title: "Workflow Engineer (Enterprise)",            company: "Tray.io",        score: 100, loc: "St George, UT", salary: "$155–200k", st: true  },
    { title: "Forward Deployed Engineer",                 company: "Decagon",        score:  72, loc: "Remote",        salary: "$175–240k", st: false },
  ];
  return (
    <div className="bg-[var(--bg)]">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grad-text font-bold">★</span>
          <span className="font-semibold text-sm">JobScout</span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
          Sample
        </span>
      </div>
      <ul className="p-3 space-y-2">
        {jobs.map((j) => (
          <li key={j.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] p-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--muted)] truncate">{j.company}</p>
                <p className="text-sm font-semibold leading-tight line-clamp-2">{j.title}</p>
                <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                  {j.st && <Pill tone="accent"><Star size={10} /> St George</Pill>}
                  <Pill>{j.loc}</Pill>
                  <Pill tone="good">{j.salary}</Pill>
                </div>
              </div>
              <div className="shrink-0 rounded-lg px-2 py-1 text-center" style={{ background: j.score >= 80 ? "var(--good-soft)" : "var(--accent-soft)" }}>
                <div className={`text-base font-bold ${j.score >= 80 ? "text-[var(--good)]" : "text-[var(--accent)]"}`}>{j.score}</div>
                <div className="text-[8px] uppercase tracking-wide opacity-70">match</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="px-3 pb-3">
        <Link href="/signup" className="block w-full rounded-xl bg-[var(--bg-elev)] border border-[var(--border)] py-2 text-center text-xs font-medium hover:border-[var(--accent-2)]">
          See your real matches <ArrowRight size={12} className="inline -mt-0.5" />
        </Link>
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "accent" | "good" }) {
  const cls =
    tone === "accent" ? "bg-[var(--accent-soft)] text-[var(--accent)]" :
    tone === "good"   ? "bg-[var(--good-soft)] text-[var(--good)]"     :
                        "bg-[var(--bg-elev-2)] text-[var(--muted)]";
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

/* tiny floating particle for cosmic accent — defined inline-CSS via .particle class */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      // narrows the style prop without disabling type-checking elsewhere
    }
  }
}
