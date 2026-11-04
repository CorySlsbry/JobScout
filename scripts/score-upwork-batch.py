#!/usr/bin/env python3
"""Score a batch of Upwork jobs via the deployed /api/upwork/score endpoint.
Reads candidates from candidates.json (next to this script) and emits a
ranked CSV/markdown table. Uses ~$0.01 per 10 jobs on Haiku.

candidates.json format:
[{"title": "...", "url": "...", "text": "..."}, ...]
"""
import json
import os
import sys
import urllib.request
import urllib.error
import ssl
from concurrent.futures import ThreadPoolExecutor

TOKEN = os.environ.get("JOBSCOUT_TOKEN", "REDACTED")
ENDPOINT = "https://jobscout-wnwafxvfia-uw.a.run.app/api/upwork/score"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def score_one(c):
    body = json.dumps({"jobText": c["text"], "pageUrl": c.get("url")}).encode()
    req = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            j = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        return {**c, "error": f"HTTP {e.code}: {body}"}
    except Exception as e:
        return {**c, "error": str(e)}
    s = j.get("score", {})
    return {
        **c,
        "verdict": s.get("verdict"),
        "score": s.get("score", 0),
        "reasons": s.get("reasons", []),
        "dimensions": s.get("dimensions", []),
        "filter_violations": s.get("filter_violations", []),
        "is_hourly": s.get("is_hourly"),
        "hourly_low": s.get("hourly_rate_low"),
        "hourly_high": s.get("hourly_rate_high"),
        "fixed_budget": s.get("fixed_budget"),
        "proposals_already": s.get("proposals_already"),
    }

def main(path):
    candidates = json.load(open(path, encoding="utf-8"))
    print(f"Scoring {len(candidates)} jobs in parallel (concurrency=5)...", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=5) as pool:
        results = list(pool.map(score_one, candidates))
    # Sort: apply verdicts first, then by score desc
    def sort_key(r):
        v = 0 if r.get("verdict") == "apply" else 1
        return (v, -(r.get("score") or 0))
    results.sort(key=sort_key)
    # Output JSON for downstream processing
    print(json.dumps(results, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "candidates.json")
