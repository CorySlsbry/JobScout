import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobScout — AI-ranked job feed + Upwork extension",
    short_name: "JobScout",
    description:
      "AI-ranked jobs across LinkedIn, Indeed, ZipRecruiter, Glassdoor + Greenhouse/Ashby/Lever portals. Pro tier: Upwork extension + Gmail inbox watcher + comp benchmarks.",
    start_url: "/feed",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0613",   // Aurora deep-purple base
    theme_color: "#7c3aed",        // Aurora primary purple
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
