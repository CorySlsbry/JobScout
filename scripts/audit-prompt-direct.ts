// Direct prompt audit. Imports our actual TAILOR_RESUME_SYSTEM and calls
// Claude with it + the live base resume + a real job. No auth dance — this
// tests the prompt itself, which is what we care about.

import Anthropic from "@anthropic-ai/sdk";
import { TAILOR_RESUME_SYSTEM, buildTailorPrompt } from "../src/lib/anthropic.ts";

async function main() {
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

// 1. Read base resume from Firestore via REST.
const fsResp = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/profile/me`,
  { headers: { Authorization: `Bearer ${process.env.GCP_TOKEN}` } }
);
const baseResume = (await fsResp.json())?.fields?.resume_md?.stringValue ?? "";
console.log(`Base resume: ${baseResume.length} chars`);

// 2. Pick the longest-description job.
const jobsResp = await fetch(
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/jobs?pageSize=20`,
  { headers: { Authorization: `Bearer ${process.env.GCP_TOKEN}` } }
);
const docs = (await jobsResp.json())?.documents ?? [];
const job = docs
  .map((d) => ({
    title: d.fields?.title?.stringValue ?? "",
    company: d.fields?.company?.stringValue ?? "",
    description: d.fields?.description?.stringValue ?? "",
  }))
  .sort((a, b) => b.description.length - a.description.length)[0];
console.log(`Job: ${job.title} @ ${job.company} (${job.description.length} chars)`);

// 3. Call Claude with our exact prompt.
const userPrompt = buildTailorPrompt(baseResume, job.title, job.company, job.description);
const client = new Anthropic({ apiKey });
const start = Date.now();
const resp = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 3000,
  system: TAILOR_RESUME_SYSTEM,
  messages: [{ role: "user", content: userPrompt }],
});
const tailored = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("");
console.log(`Tailor: ${tailored.length} chars in ${Math.round((Date.now() - start) / 1000)}s`);

// 4. Audit.
const baseLower = baseResume.toLowerCase();
const tailLower = tailored.toLowerCase();
const jdLower = job.description.toLowerCase();
const TECH = ["kubernetes","docker","python","java","ruby","golang","scala","kafka","redis","mongodb","mysql","aws","azure","gcp","spring","django","rails","airflow","kotlin","swift","rust","graphql","grpc","spark","hadoop","tableau","power bi","kibana","elasticsearch","terraform","jenkins","kotlin","ansible","prometheus","grafana"];

const jdHas = TECH.filter((t) => jdLower.includes(t));
const baseLacks = jdHas.filter((t) => !baseLower.includes(t));
const fabricated = baseLacks.filter((t) => tailLower.includes(t));

console.log("\n=== FABRICATION AUDIT ===");
console.log(`Tech in JD:                       ${jdHas.join(", ") || "(none)"}`);
console.log(`Tech in JD but NOT in base:       ${baseLacks.join(", ") || "(none)"}`);
console.log(`Tech tailored mentions but not in base (FABRICATIONS): ${
  fabricated.length === 0 ? "[NONE — clean] ✅" : fabricated.join(", ") + "  ❌"
}`);

const tailoredCompanies = [...tailored.matchAll(/###\s+[^—\n]+—\s+([^,\n]+)/g)].map((m) => m[1].trim());
const inventedCompanies = tailoredCompanies.filter((c) => !baseLower.includes(c.toLowerCase()));
console.log(`\nEmployers in tailored:            ${tailoredCompanies.join(", ")}`);
console.log(`Invented employers:               ${inventedCompanies.length === 0 ? "[NONE — clean] ✅" : inventedCompanies.join(", ") + " ❌"}`);

// Spot-check certifications too.
const baseCerts = (baseResume.match(/(ASE|Tesla Master|Bachelor|AAS|MBA|PhD|AWS|Azure|GCP|CompTIA|Cisco|PMP)/gi) ?? []).map(s => s.toLowerCase());
const tailCerts = (tailored.match(/(ASE|Tesla Master|Bachelor|AAS|MBA|PhD|AWS|Azure|GCP|CompTIA|Cisco|PMP)/gi) ?? []).map(s => s.toLowerCase());
const inventedCerts = [...new Set(tailCerts)].filter((c) => !baseCerts.includes(c));
console.log(`\nCertifications/degrees in base:   ${[...new Set(baseCerts)].join(", ") || "(none detected)"}`);
console.log(`Certifications/degrees in tailored: ${[...new Set(tailCerts)].join(", ") || "(none detected)"}`);
console.log(`Invented certifications:          ${inventedCerts.length === 0 ? "[NONE — clean] ✅" : inventedCerts.join(", ") + " ❌"}`);

// Numeric-claim audit — most common fabrication mode.
const baseNums = baseResume.match(/\b(\d+\+?(?:\.\d+)?%?|\$\d[\d,.]*[kKmMbB]?)\b/g) ?? [];
const tailNums = tailored.match(/\b(\d+\+?(?:\.\d+)?%?|\$\d[\d,.]*[kKmMbB]?)\b/g) ?? [];
const baseNumSet = new Set(baseNums.map(n => n.toLowerCase()));
const suspectNums = [...new Set(tailNums)]
  .map(n => n.toLowerCase())
  .filter(n => !baseNumSet.has(n))
  // Years like "2016", "2018-Present" appear verbatim in base; numeric tokens like "1", "2", "3" are too generic
  .filter(n => !/^(19|20)\d{2}$/.test(n) && n.length > 1);
console.log(`\nNumeric tokens in base:           ${[...baseNumSet].join(", ") || "(none)"}`);
console.log(`Suspect numbers in tailored (not in base, not a year): ${
  suspectNums.length === 0 ? "[NONE — clean] ✅" : "❌ " + suspectNums.join(", ")
}`);

// Title check — if base has "Sr. Service Technician", tailored should not say "Master Technician" etc.
const baseTitles = [...baseResume.matchAll(/(?:^|\n)\s*([A-Z][^—\n]*?)\s+(?:—|@|at|,)/gm)].map(m => m[1].trim()).slice(0, 8);
console.log(`\nRole-title hints in base:         ${baseTitles.join(" | ") || "(check manually)"}`);
const tailTitlesMatch = [...tailored.matchAll(/###\s+([^—\n*]+?)\s+(?:—|--)\s+/g)].map(m => m[1].trim());
console.log(`Role titles in tailored:          ${tailTitlesMatch.join(" | ") || "(check manually)"}`);

// Skills-section format audit (each category must be its own paragraph)
const skillsMatch = tailored.match(/##\s+(?:Technical\s+)?Skills[\s\S]+?(?=\n##|$)/i);
if (skillsMatch) {
  const section = skillsMatch[0];
  const cats = (section.match(/\*\*[^*]+:\*\*/g) ?? []).length;
  const blanks = (section.match(/\n\s*\n\s*\*\*/g) ?? []).length;
  console.log(`\n=== SKILLS SECTION AUDIT ===`);
  console.log(`  categories: ${cats}`);
  console.log(`  blank-line boundaries between categories: ${blanks} (need ≥ ${cats - 1})`);
  console.log(`  status: ${blanks >= cats - 1 ? "[OK] each category on its own paragraph ✅" : "[FAIL] categories squished into one paragraph ❌"}`);
}

console.log("\n=== full tailored output ===");
console.log(tailored);
}
main().catch((e) => { console.error(e); process.exit(1); });
