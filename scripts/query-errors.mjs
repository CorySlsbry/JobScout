import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: applicationDefault(), projectId: 'jobscout-app' });
const db = getFirestore();
const snap = await db.collection('errors').orderBy('created_at', 'desc').limit(5).get();
console.log(`Most recent ${snap.size} errors:`);
for (const d of snap.docs) {
  const e = d.data();
  console.log('---');
  console.log(`  at:       ${e.created_at}`);
  console.log(`  release:  ${e.release}`);
  console.log(`  source:   ${e.source}`);
  console.log(`  path:     ${e.path}`);
  console.log(`  name:     ${e.name}`);
  console.log(`  message:  ${e.message}`);
  console.log(`  user:     ${e.user_email ?? e.user_id ?? 'anon'}`);
  if (e.stack) console.log(`  stack: ${e.stack.slice(0, 500)}`);
}
process.exit(0);
