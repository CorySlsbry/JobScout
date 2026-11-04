// Runs on Upwork job-detail, proposal, AND search/find-work pages.
//
// DETAIL PAGE (/jobs/, /nx/s/job-details-viewer/, /nx/jobs/):
//   Floating ★ JobScout button. Alt+Shift+J or click → score the whole JD,
//   then offer "Draft proposal" → fills Upwork's cover-letter textarea on
//   /proposals/job/* pages.
//
// SEARCH / FIND-WORK PAGE (/nx/search/jobs/, /nx/find-work/):
//   Alt+Shift+J → bulk-score every visible job card. Each card gets a
//   colored verdict badge so you can scan and skip without clicking through.
//   Three requests in flight at a time to keep Cloud Run happy.

(function () {
  if (window.__jobscoutMounted) return;
  window.__jobscoutMounted = true;

  const PAGE_KIND = detectPageKind();

  // ── Mount FAB + panel (used on detail pages, and as the trigger UI on lists) ──
  const root = document.createElement("div");
  root.id = "jobscout-root";
  root.innerHTML = `
    <button id="jobscout-fab" title="Score (Alt+Shift+J)">
      <span class="jobscout-star">★</span> JobScout
    </button>
    <div id="jobscout-panel" hidden>
      <header>
        <span class="jobscout-star">★</span>
        <strong>JobScout</strong>
        <button class="jobscout-close" aria-label="Close">×</button>
      </header>
      <div class="jobscout-body"></div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const fab = root.querySelector("#jobscout-fab");
  const panel = root.querySelector("#jobscout-panel");
  const body = panel.querySelector(".jobscout-body");

  fab.addEventListener("click", onTrigger);
  panel.querySelector(".jobscout-close").addEventListener("click", () => togglePanel(false));
  body.addEventListener("click", onBodyClick);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "score-current-job") onTrigger();
  });

  // ── Page-kind dispatcher ───────────────────────────────────────────────
  function detectPageKind() {
    const p = location.pathname;
    if (/^\/nx\/search\/jobs\//.test(p) || /^\/nx\/find-work\//.test(p)) return "list";
    return "detail";
  }

  function onTrigger() {
    if (PAGE_KIND === "list") {
      togglePanel(true);
      scoreAllCards();
    } else {
      togglePanel(true);
      renderDetailHint();
      scoreCurrentJob();
    }
  }

  function togglePanel(open) { panel.hidden = !open; }

  function renderDetailHint() {
    body.innerHTML = `<p class="jobscout-hint">Scoring this job…</p>`;
  }

  function onBodyClick(e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "score")           scoreCurrentJob();
    if (btn.dataset.act === "draft")           draftProposal();
    if (btn.dataset.act === "fill")            fillProposalForm();
    if (btn.dataset.act === "rescore-all")     scoreAllCards();
    if (btn.dataset.act === "fill-app")        fillEntireApplication();
  }

  // ── API helper ─────────────────────────────────────────────────────────
  function api(path, body) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "api", path, method: "POST", body }, resolve);
    });
  }

  // ═════════════════════════════════════════════════════════════════════
  // DETAIL PAGE FLOW (single-job scoring + draft)
  // ═════════════════════════════════════════════════════════════════════
  function getJobText() {
    const selectors = [
      '[data-test="job-description"]',
      '[data-test="JobDescription"]',
      '[data-test="Description"]',
      'section.air3-card section',
      'main',
    ];
    let text = "";
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const t = (el?.innerText ?? "").trim();
      if (t.length > text.length) text = t;
    }
    return text.slice(0, 18_000);
  }

  let lastScore = null;

  async function scoreCurrentJob() {
    const jobText = getJobText();
    if (jobText.length < 80) {
      renderError("Couldn't find job description on this page. Open the job's detail view first.");
      return;
    }
    renderBusy("Scoring against your resume…");
    const r = await api("/api/upwork/score", { jobText, pageUrl: location.href });
    if (!r?.ok) { renderError(formatErr(r)); return; }
    lastScore = r.json.score;
    renderScore(lastScore);
  }

  async function draftProposal() {
    const jobText = getJobText();
    if (!jobText) { renderError("Can't read job text."); return; }
    renderBusy("Drafting proposal with Claude Sonnet…");
    const r = await api("/api/upwork/draft-bid", { jobText, pageUrl: location.href });
    if (!r?.ok) { renderError(formatErr(r)); return; }
    renderBid(r.json.bid);
  }

  function fillProposalForm() {
    const text = panel.querySelector('#jobscout-bid-text')?.value ?? "";
    if (!text) {
      renderError("No drafted proposal to fill yet.");
      return;
    }
    // Upwork's current Submit-Proposal page uses an "Air3" textarea component
    // with NO name / id / data-test — and renders 6+ textareas (cover letter
    // PLUS per-job screening questions). We target by section-heading text.
    const ta = findCoverLetterTextarea();
    if (!ta) {
      const count = document.querySelectorAll("textarea").length;
      renderError(`Couldn't find Upwork's "Cover Letter" textarea (saw ${count} textareas on the page, none labelled). If you're on the Submit-Proposal page, scroll until the Cover Letter section is in view and click Fill again.`);
      return;
    }
    // Scroll into view so you can see what just happened
    ta.scrollIntoView({ block: "center", behavior: "smooth" });
    // React-aware value setter — Upwork's Air3 component is wrapped by
    // React's value tracker; setting `.value` directly doesn't fire
    // onChange. Using the prototype descriptor bypasses the tracker, then
    // a bubbling "input" event triggers Upwork's handler.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(ta, text);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    ta.focus();
    flashOk("Pasted into Cover Letter. Scroll back and click Send when you're ready.");
  }

  // ── Whole-application fill (Submit-Proposal page) ─────────────────────
  // Scrape every visible question textarea on the page (cover letter + each
  // screening question), send them to /api/upwork/draft-application in one
  // Sonnet call, then fill each one by heading match.
  async function fillEntireApplication() {
    const jobText = getJobText();
    if (jobText.length < 80) { renderError("Can't read job description on this page."); return; }
    const fields = scrapeApplicationFields();
    if (!fields.length) { renderError("Couldn't find any application questions on this page. Are you on the Submit-Proposal page?"); return; }

    renderBusy(`Drafting cover letter + ${Math.max(0, fields.length - 1)} screening question${fields.length === 2 ? "" : "s"}…`);
    const r = await api("/api/upwork/draft-application", {
      jobText,
      fields: fields.map((f) => ({ heading: f.heading, current: f.value })),
      pageUrl: location.href,
    });
    if (!r?.ok) { renderError(formatErr(r)); return; }

    const app = r.json.application ?? r.json;
    const answers = Array.isArray(app?.answers) ? app.answers : [];
    if (!answers.length) { renderError("Server returned no answers."); return; }

    // Fill each field by matching the answer's heading back to a textarea.
    let filled = 0, skipped = 0;
    for (const ans of answers) {
      const target = findFieldByHeading(ans.heading);
      if (!target || !ans.text) { skipped++; continue; }
      setReactTextareaValue(target, ans.text);
      filled++;
    }

    // Scroll back up so the user can review from the top.
    const firstTa = findCoverLetterTextarea();
    if (firstTa) firstTa.scrollIntoView({ block: "start", behavior: "smooth" });

    const bidNote = app?.suggested_bid != null
      ? `Suggested ${app.suggested_bid_kind ?? "bid"}: ${fmtMoney(app.suggested_bid)}${app.suggested_duration_weeks ? ` · ${app.suggested_duration_weeks} weeks` : ""}`
      : "";

    body.innerHTML = `
      <div class="jobscout-verdict"><span class="jobscout-good">★ Filled ${filled} field${filled === 1 ? "" : "s"}</span></div>
      ${skipped > 0 ? `<p class="jobscout-meta">${skipped} field${skipped === 1 ? "" : "s"} skipped (no heading match).</p>` : ""}
      ${bidNote ? `<p class="jobscout-meta">${escapeHtml(bidNote)}</p>` : ""}
      <p class="jobscout-meta" style="margin-top:8px">Scroll up and review every answer before clicking Submit. Nothing has been submitted to Upwork.</p>
      <button class="jobscout-action-secondary" data-act="fill-app">Re-draft &amp; refill</button>
    `;
  }

  // Scrape every visible textarea on the page that's NOT inside our own
  // panel. Each becomes a "field" with its nearby heading text.
  function scrapeApplicationFields() {
    const all = Array.from(document.querySelectorAll("textarea"));
    const out = [];
    for (const t of all) {
      if (!isVisible(t)) continue;
      if (t.closest("#jobscout-root")) continue;       // exclude our own UI
      const heading = getNearestHeadingText(t);
      if (!heading) continue;
      out.push({ heading, value: t.value || "", el: t });
    }
    return out;
  }

  // Find the textarea whose nearby heading matches the given text (the same
  // heading the AI returned in its answers array).
  function findFieldByHeading(heading) {
    if (!heading) return null;
    const target = heading.trim().toLowerCase();
    const all = Array.from(document.querySelectorAll("textarea")).filter(isVisible).filter((t) => !t.closest("#jobscout-root"));
    // Exact match first
    for (const t of all) {
      const h = (getNearestHeadingText(t) || "").trim().toLowerCase();
      if (h === target) return t;
    }
    // Fuzzy match — heading STARTS WITH the target, or target starts with heading
    for (const t of all) {
      const h = (getNearestHeadingText(t) || "").trim().toLowerCase();
      if (h.startsWith(target) || target.startsWith(h)) return t;
    }
    // Substring match
    for (const t of all) {
      const h = (getNearestHeadingText(t) || "").trim().toLowerCase();
      if (h && (h.includes(target) || target.includes(h))) return t;
    }
    return null;
  }

  // Walk up the DOM looking for the nearest heading or label whose text
  // describes this field.
  function getNearestHeadingText(el) {
    let cur = el.parentElement;
    for (let depth = 0; cur && cur !== document.body && depth < 10; depth++) {
      const owned = cur.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > label, :scope > div > h1, :scope > div > h2, :scope > div > h3, :scope > div > label, :scope > div > div > label, :scope > div > strong");
      if (owned && owned.innerText.trim()) return owned.innerText.trim();
      let sib = cur.previousElementSibling;
      while (sib) {
        const h = sib.matches("h1,h2,h3,h4,label,strong") ? sib : sib.querySelector("h1,h2,h3,h4,label,strong");
        if (h && h.innerText.trim()) return h.innerText.trim();
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return "";
  }

  // React-aware setter helper — reused by single-field and bulk-fill paths.
  function setReactTextareaValue(el, text) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findCoverLetterTextarea() {
    const all = Array.from(document.querySelectorAll('textarea'));
    if (!all.length) return null;
    // Pass 1: heading-aware match — walk up the DOM and look for a heading
    // whose text contains "cover letter".
    for (const t of all) {
      if (!isVisible(t)) continue;
      if (hasNearbyLabelMatching(t, /cover\s*letter/i)) return t;
    }
    // Pass 2: prefer the FIRST visible .air3-textarea (Upwork's component).
    // Cover letter is the first textarea in the form; screening questions
    // come after it.
    const air3 = all.find((t) => isVisible(t) && /air3-textarea/.test(t.className || ""));
    if (air3) return air3;
    // Pass 3: any visible textarea at all.
    return all.find(isVisible) ?? null;
  }

  function isVisible(el) {
    return el && el.offsetParent !== null && el.getClientRects().length > 0;
  }

  function hasNearbyLabelMatching(el, pattern) {
    // Walk up to ~8 levels; at each level check (a) direct child headings/
    // labels of the current node, (b) preceding-sibling headings.
    let cur = el.parentElement;
    for (let depth = 0; cur && cur !== document.body && depth < 8; depth++) {
      const owned = cur.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > label, :scope > div > h1, :scope > div > h2, :scope > div > h3, :scope > div > label");
      for (const h of owned) {
        if (pattern.test(h.innerText || "")) return true;
      }
      let sib = cur.previousElementSibling;
      while (sib) {
        const h = sib.matches("h1,h2,h3,h4,label") ? sib : sib.querySelector("h1,h2,h3,h4,label");
        if (h && pattern.test(h.innerText || "")) return true;
        sib = sib.previousElementSibling;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  // ═════════════════════════════════════════════════════════════════════
  // SEARCH / FIND-WORK FLOW (bulk-score list of cards)
  // ═════════════════════════════════════════════════════════════════════
  function findJobCards() {
    // Upwork's DOM is volatile — try a chain of selectors and fall back to
    // any <article> or <section> in <main> that contains a job-tile shape.
    const candidates = [
      'article[data-test="JobTile"]',
      'section[data-test="JobTile"]',
      'article[data-ev-position_on_page]',
      'section[data-ev-position_on_page]',
      '[data-test="job-tile-list"] article',
      '[data-test="job-tile-list"] section',
    ];
    for (const sel of candidates) {
      const list = document.querySelectorAll(sel);
      if (list.length > 0) return Array.from(list);
    }
    // Fallback: <article>s inside main that have a heading + at least 200 chars
    const arts = Array.from(document.querySelectorAll('main article, main section'));
    return arts.filter((a) => {
      const t = (a.innerText ?? "").trim();
      return t.length > 200 && /posted/i.test(t);
    });
  }

  function extractCardText(card) {
    return (card.innerText ?? "").trim().slice(0, 8_000);
  }

  function ensureBadgeContainer(card) {
    let badge = card.querySelector(".jobscout-badge");
    if (badge) return badge;
    badge = document.createElement("div");
    badge.className = "jobscout-badge jobscout-badge-pending";
    badge.innerHTML = `<span class="jobscout-star">★</span> <span class="jobscout-badge-label">scoring…</span>`;
    // Insert near the top of the card. Position absolute so we don't fight layout.
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    card.prepend(badge);
    return badge;
  }

  function setBadge(card, kind, label, tooltip) {
    const badge = ensureBadgeContainer(card);
    badge.className = `jobscout-badge jobscout-badge-${kind}`;
    badge.querySelector(".jobscout-badge-label").textContent = label;
    if (tooltip) badge.title = tooltip;
  }

  async function scoreOneCard(card) {
    const text = extractCardText(card);
    if (text.length < 80) { setBadge(card, "skip", "too short"); return null; }
    const r = await api("/api/upwork/score", { jobText: text, pageUrl: location.href });
    if (!r?.ok) {
      setBadge(card, "err", "error", formatErr(r));
      return null;
    }
    const s = r.json.score;
    const violations = (s.filter_violations ?? []).join("; ");
    if (s.verdict === "apply") {
      setBadge(card, "apply", `★ ${s.score} APPLY`, (s.reasons ?? []).join(" · "));
    } else {
      setBadge(card, "skip", `✕ skip${s.score ? ` · ${s.score}` : ""}`, violations || (s.reasons ?? []).join(" · "));
    }
    return s;
  }

  async function scoreAllCards() {
    const cards = findJobCards();
    if (!cards.length) {
      renderError("No job cards found on this page. Scroll the list to make sure they're rendered, then try again.");
      return;
    }
    body.innerHTML = `<p class="jobscout-busy"><span class="jobscout-spin"></span> Scoring ${cards.length} jobs…</p>
      <p class="jobscout-meta">Each card gets a colored badge. Green = apply, red = skip.</p>`;

    // Mark every card as pending up-front so the user sees instant feedback
    cards.forEach((c) => ensureBadgeContainer(c));

    // Concurrency = 3. Haiku is cheap but Cloud Run min-instances=0 — slow ramp.
    const queue = cards.slice();
    const inflight = new Set();
    let applies = 0, skips = 0, errs = 0;

    async function runOne(card) {
      try {
        const s = await scoreOneCard(card);
        if (!s) { errs++; return; }
        if (s.verdict === "apply") applies++; else skips++;
      } catch { errs++; }
    }

    while (queue.length || inflight.size) {
      while (inflight.size < 3 && queue.length) {
        const card = queue.shift();
        const p = runOne(card).finally(() => inflight.delete(p));
        inflight.add(p);
      }
      if (inflight.size) await Promise.race(inflight);
      // Update summary
      body.innerHTML = `<p class="jobscout-busy"><span class="jobscout-spin"></span>
          Scoring… <strong class="jobscout-good">${applies}</strong> apply ·
          <strong class="jobscout-bad">${skips}</strong> skip ·
          ${errs ? `<strong>${errs}</strong> err` : ""}
          (${applies + skips + errs}/${cards.length})
        </p>`;
    }

    body.innerHTML = `
      <p class="jobscout-verdict">Done · <span class="jobscout-good">${applies} apply</span> · <span class="jobscout-bad">${skips} skip</span>${errs ? ` · <span>${errs} err</span>` : ""}</p>
      <p class="jobscout-meta">Click a green badge to expand reasons. Scroll the page to score more.</p>
      <button class="jobscout-action" data-act="rescore-all">Re-score visible jobs</button>
    `;
  }

  // ── Renderers ──────────────────────────────────────────────────────────
  function renderBusy(label) {
    body.innerHTML = `<p class="jobscout-busy"><span class="jobscout-spin"></span> ${escapeHtml(label)}</p>`;
  }

  function renderError(msg) {
    body.innerHTML = `
      <div class="jobscout-err">${escapeHtml(msg)}</div>
      <button class="jobscout-action" data-act="${PAGE_KIND === 'list' ? 'rescore-all' : 'score'}">Try again</button>
    `;
  }

  function renderScore(s) {
    const verdict = s.verdict === "apply"
      ? `<span class="jobscout-good">★ APPLY · ${s.score}/100</span>`
      : `<span class="jobscout-bad">✕ SKIP · ${s.score}/100</span>`;
    const violations = (s.filter_violations ?? []).length
      ? `<div class="jobscout-violations"><strong>Filter trips:</strong><ul>${s.filter_violations.map((v) => `<li>${escapeHtml(v)}</li>`).join("")}</ul></div>`
      : "";
    const reasons = (s.reasons ?? []).length
      ? `<ul class="jobscout-reasons">${s.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
      : "";
    const dimensions = renderDimensions(s.dimensions);
    const rate = s.is_hourly === true
      ? `Hourly: ${fmtMoney(s.hourly_rate_low)}–${fmtMoney(s.hourly_rate_high)}/hr`
      : s.is_hourly === false ? `Fixed: ${fmtMoney(s.fixed_budget)}`
      : "Rate: unclear";
    const draftBtn = s.verdict === "apply"
      ? `<button class="jobscout-action" data-act="draft">Draft proposal →</button>`
      : `<button class="jobscout-action-secondary" data-act="draft">Draft proposal anyway →</button>`;
    body.innerHTML = `
      <div class="jobscout-verdict">${verdict}</div>
      <p class="jobscout-meta">${escapeHtml(rate)}${s.proposals_already != null ? ` · ${s.proposals_already} proposals` : ""}</p>
      ${dimensions}
      ${reasons}
      ${violations}
      ${draftBtn}
    `;
  }

  function renderDimensions(dims) {
    if (!Array.isArray(dims) || !dims.length) return "";
    return `<div class="jobscout-dims">${
      dims.map((d) => {
        const score = Math.max(0, Math.min(100, Number(d.score) || 0));
        const kind = score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
        return `
          <div class="jobscout-dim">
            <div class="jobscout-dim-row">
              <span class="jobscout-dim-name">${escapeHtml(d.name ?? "")}</span>
              <span class="jobscout-dim-score jobscout-dim-${kind}">${score}</span>
            </div>
            <div class="jobscout-dim-bar"><div class="jobscout-dim-fill jobscout-dim-${kind}" style="width:${score}%"></div></div>
            <div class="jobscout-dim-note">${escapeHtml(d.note ?? "")}</div>
          </div>`;
      }).join("")
    }</div>`;
  }

  function renderBid(b) {
    const bidLabel = b.suggested_bid != null
      ? `Suggested ${b.suggested_bid_kind ?? "bid"}: ${fmtMoney(b.suggested_bid)}`
      : "";
    const onApply = isApplyPage();
    body.innerHTML = `
      <p class="jobscout-meta">${escapeHtml(bidLabel)}</p>
      <textarea id="jobscout-bid-text" rows="10">${escapeHtml(b.proposal ?? "")}</textarea>
      ${b.first_question ? `<p class="jobscout-meta"><strong>Suggested question:</strong> ${escapeHtml(b.first_question)}</p>` : ""}
      ${onApply ? `
        <div class="jobscout-row" style="margin-top:8px">
          <button class="jobscout-action" data-act="fill-app">★ Fill entire application →</button>
        </div>
        <p class="jobscout-meta" style="margin-top:4px;font-size:11px">Drafts cover letter + every screening question in one shot.</p>
      ` : ""}
      <div class="jobscout-row">
        <button class="jobscout-action-secondary" data-act="fill">Fill cover letter only</button>
        <button class="jobscout-action-secondary" id="jobscout-copy">Copy</button>
      </div>
    `;
    body.querySelector("#jobscout-copy").addEventListener("click", async () => {
      const ta = body.querySelector("#jobscout-bid-text");
      await navigator.clipboard.writeText(ta.value);
      flashOk("Copied.");
    });
  }

  function isApplyPage() {
    return /\/(?:nx|ab)\/proposals\/job\/.+\/apply/.test(location.pathname);
  }

  function flashOk(msg) {
    const t = document.createElement("div");
    t.className = "jobscout-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ── Utils ──────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtMoney(n) {
    if (n == null) return "?";
    return "$" + Number(n).toLocaleString();
  }
  function formatErr(r) {
    if (!r) return "No response (background worker offline).";
    if (r.error === "no_token") return r.help ?? "Set your token in the extension popup.";
    if (r.json?.error === "admin_only") return "Admin-only feature.";
    if (r.json?.error === "no_base_resume") return r.json.help ?? "Save a base resume in JobScout settings.";
    if (r.json?.error === "anthropic_not_configured") return "ANTHROPIC_API_KEY isn't set on the server.";
    if (r.json?.error) return r.json.error + (r.json.help ? ` — ${r.json.help}` : "");
    return `HTTP ${r.status ?? "?"}`;
  }
})();
