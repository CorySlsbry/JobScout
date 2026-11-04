// Reproduce the exact flow the Web SDK runs on signup, to see if any
// piece is rejected. This is what AuthForm runs in the browser.

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? "jobscout-app";
const apiKey = "REDACTED";
const BASE = process.env.BASE_URL ?? "https://jobscout-wnwafxvfia-uw.a.run.app";

const email = `signup-test-${Date.now()}@example.com`;
const password = "REDACTED" + Math.random().toString(36).slice(2, 8);

console.log(`\n=== STEP 1: signUp via Identity Toolkit REST (what Web SDK does) ===`);
const signUpResp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }
);
console.log(`signUp status: ${signUpResp.status}`);
const signUp = await signUpResp.json();
if (!signUp.idToken) {
  console.error("signUp FAILED:", JSON.stringify(signUp, null, 2));
  process.exit(1);
}
console.log(`signUp OK — uid: ${signUp.localId}, idToken length: ${signUp.idToken.length}`);

console.log(`\n=== STEP 2: POST /api/auth/session ===`);
const sessResp = await fetch(`${BASE}/api/auth/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ idToken: signUp.idToken }),
});
console.log(`session status: ${sessResp.status}`);
const sessText = await sessResp.text();
console.log(`session body: ${sessText.slice(0, 300)}`);

console.log(`\n=== STEP 3: signIn the same user (repro signin) ===`);
const signInResp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }
);
console.log(`signIn status: ${signInResp.status}`);
const signIn = await signInResp.json();
if (signIn.idToken) {
  console.log(`signIn OK — same uid: ${signIn.localId}`);
} else {
  console.error("signIn FAILED:", JSON.stringify(signIn, null, 2));
}
