import Link from "next/link";
import { redirect } from "next/navigation";
import { listStories } from "@/lib/stories";
import { getSessionUser } from "@/lib/auth";
import RoleHero from "@/components/RoleHero";
import RoleSection from "@/components/RoleSection";
import GlassTile from "@/components/GlassTile";
import StoryEditor from "@/components/StoryEditor";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect("/signin");
  const stories = await listStories(sessionUser.uid);

  // Most-used tag — gives a quick hint at where the user's bank is concentrated.
  const tagCounts: Record<string, number> = {};
  for (const s of stories) for (const t of s.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 pt-5 pb-28">
      <nav className="flex items-center justify-between gap-2 mb-4">
        <Link href="/" className="text-sm text-fg-muted hover:text-fg">← Home</Link>
        <Link href="/settings" className="text-sm text-fg-muted hover:text-fg">Settings →</Link>
      </nav>

      <RoleHero
        eyebrow="JobScout · Interview Prep"
        title="Story Bank"
        highlight="Story Bank"
        subtitle="STAR + R behavioral stories. Aim for 5-10 strong ones — they answer every behavioral question across every loop. The +R (Reflection) is the part most candidates skip; it's the one interviewers remember."
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        <GlassTile
          label="Stories"
          value={<span className="text-xl num-tile">{stories.length}</span>}
          sub={stories.length < 5 ? `${5 - stories.length} more to reach baseline` : "above baseline"}
          dotColor={stories.length >= 5 ? "#34d399" : "#fbbf24"}
        />
        <GlassTile
          label="Top tag"
          value={<span className="text-sm">{topTag?.[0] ?? "—"}</span>}
          sub={topTag ? `${topTag[1]} stories` : "no tags yet"}
          dotColor="#c084fc"
        />
        <GlassTile
          label="Last updated"
          value={<span className="text-sm">{stories[0]?.updated_at ? relTime(stories[0].updated_at) : "—"}</span>}
          sub={stories[0]?.title?.slice(0, 32) ?? "no stories yet"}
          dotColor="#38bdf8"
        />
      </div>

      <RoleSection title="Add a new story" lede="Write it once, reuse it across every interview. Each field is plain text — no markdown needed.">
        <StoryEditor mode="create" />
      </RoleSection>

      <RoleSection title={`Your stories (${stories.length})`} lede="Click any story to edit. Tag with archetypes so the matcher knows when to surface it.">
        {stories.length === 0 ? (
          <p className="text-sm text-fg-muted">No stories yet. Add your first above — pick a moment you led without authority, or shipped under pressure, or recovered from a real failure.</p>
        ) : (
          <ul className="space-y-3">
            {stories.map((s) => (
              <li key={s.id} className="rounded-card border border-border bg-bg-elev/60 p-4">
                <StoryEditor mode="edit" story={s} />
              </li>
            ))}
          </ul>
        )}
      </RoleSection>
    </div>
  );
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.round(ms / (1000 * 60 * 60));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
