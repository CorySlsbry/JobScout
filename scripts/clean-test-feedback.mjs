import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: "jobscout-app" });
const db = getFirestore();
const snap = await db.collection("feedback").orderBy("created_at","desc").limit(300).get();
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// Heuristic: test-era entries = message contains smoke/test/verification/Claude, or user_email null+message short generic
const testish = all.filter(f => /smoke|e2e|verification|automated|test\b|claude/i.test(f.message || ""));
console.log(`Total feedback docs: ${all.length}`);
console.log(`Open: ${all.filter(f=>f.status==="open").length} | in_progress: ${all.filter(f=>f.status==="in_progress").length} | resolved: ${all.filter(f=>f.status==="resolved").length}`);
console.log(`Test-ish (smoke/e2e/verification/claude): ${testish.length}`);
console.log("--- test-ish messages (first 60 chars) ---");
testish.slice(0,20).forEach(f => console.log(`  [${f.status}] ${f.id}  ${String(f.message).slice(0,60)}`));
// Delete the explicit E2E test doc I just created + any smoke-test/verification entries
const toDelete = all.filter(f => /e2e triage verification|smoke test|automated verification|smoke-test|claude verifying|production smoke|end-to-end verification/i.test(f.message||""));
console.log(`\nDeleting ${toDelete.length} clearly-synthetic test entries...`);
for (const f of toDelete) { await db.collection("feedback").doc(f.id).delete(); }
console.log("Done. Remaining feedback docs:", all.length - toDelete.length);
process.exit(0);
