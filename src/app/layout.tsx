import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import FloatingOverlay from "@/components/FloatingOverlay";
import Analytics from "@/components/Analytics";
import PageViewTracker from "@/components/PageViewTracker";
import CookieConsent from "@/components/CookieConsent";
import ClientErrorReporter from "@/components/ClientErrorReporter";

const inter = Inter({
  subsets: ["latin"],
  variable: "--f-body-loaded",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--f-display-loaded",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--f-mono-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jobscout-wnwafxvfia-uw.a.run.app"),
  // "JobScout" first in every title — that's what browser password managers
  // and tab favicons use as the saved-credential label.
  title: {
    default: "JobScout — land a $150k+ remote tech role in 30 days",
    template: "JobScout · %s",
  },
  description:
    "AI-ranked job feed across LinkedIn, Indeed, ZipRecruiter & Glassdoor. Salary floor enforced, geography prioritized, push to your phone the moment a perfect job posts.",
  applicationName: "JobScout",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JobScout",
  },
  openGraph: {
    title: "JobScout — land a $150k+ remote tech role in 30 days",
    siteName: "JobScout",
    description:
      "AI-ranked jobs across LinkedIn, Indeed, ZipRecruiter & Glassdoor. Salary floor enforced. Push to your phone.",
    type: "website",
  },
  other: {
    // Some password managers (including Chrome's) read these explicitly
    // for the saved-credential label, falling back to the eTLD only when
    // they aren't present. Setting them keeps the entry labelled "JobScout"
    // instead of "run.app".
    "application-name": "JobScout",
    "apple-mobile-web-app-title": "JobScout",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c084fc" },
    { media: "(prefers-color-scheme: dark)",  color: "#0b0a1f" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Aurora is the default theme (deep navy + rainbow rim, matching the
  // SpaOwner design system). data-theme set on <html> so Tailwind v4 utility
  // generation can resolve every var() against the active theme.
  return (
    <html
      lang="en"
      data-theme="aurora"
      className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
      style={
        {
          // Override the CSS var values with the next/font CSS variables so
          // body inherits the actual loaded font, not the bare family name.
          "--f-body": `var(--f-body-loaded), "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`,
          "--f-display": `var(--f-display-loaded), "Fraunces", "Iowan Old Style", "Georgia", serif`,
          "--f-mono": `var(--f-mono-loaded), "JetBrains Mono", ui-monospace, "SF Mono", "Menlo", monospace`,
        } as React.CSSProperties
      }
    >
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <main className="flex-1 pt-safe">{children}</main>
        <BottomNav />
        {/* Suspense boundary required: Analytics + FloatingOverlay both call
            useSearchParams() under the hood (Next 16 requires this wrap). */}
        <Suspense fallback={null}><Analytics /></Suspense>
        <Suspense fallback={null}><PageViewTracker /></Suspense>
        <Suspense fallback={null}><FloatingOverlay /></Suspense>
        <Suspense fallback={null}><CookieConsent /></Suspense>
        <ClientErrorReporter />

      </body>
    </html>
  );
}
