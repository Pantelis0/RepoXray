# GitHub limits that affect RepoXray

What we know about GitHub's limits, written down on 20 Oct 2026. GitHub changes these, so the official docs win if they disagree:
[REST API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) · [Git trees endpoint](https://docs.github.com/en/rest/git/trees)

## REST API: primary rate limits

| Who is calling | Limit | Relevant to RepoXray? |
|---|---|---|
| **Unauthenticated** (no token) | **60 requests / hour per IP** | **Yes, this is v1.** Every user's browser has its own 60. |
| Authenticated user (personal token) | 5,000 / hour per token | Only if we add the proxy later |
| Authenticated, Enterprise Cloud org | 15,000 / hour | No |
| GitHub App installation | 5,000 / hour, can scale higher | No |
| `GITHUB_TOKEN` in GitHub Actions | 1,000 / hour per repository | Only for CI scripts |
| Search API | 30 / minute (separate bucket) | No, we don't use search |

**RepoXray's budget:** 2 REST calls per analysis (repo metadata + recursive tree), so about **30 analyses per hour per user**. File contents don't use REST (see below).

## REST API: secondary rate limits

Triggered by bursts even when the hourly budget isn't used up. GitHub's docs describe these (exact thresholds may change):
- No more than **100 concurrent requests**
- No more than about **900 points per minute** for REST (a normal GET is 1 point)
- No more than **90 seconds of CPU time per 60 seconds** of real time
- Repeatedly requesting the same resource within seconds can also trigger it

RepoXray makes only 2 sequential REST calls, so this shouldn't happen. It matters only if we ever call the Contents API per file (we won't).

## Headers and status codes

| Header | Meaning |
|---|---|
| `x-ratelimit-limit` | Your hourly allowance (60 when unauthenticated) |
| `x-ratelimit-remaining` | Calls left in this window |
| `x-ratelimit-used` | Calls used |
| `x-ratelimit-reset` | When the window resets, as a **Unix timestamp** (seconds), not a countdown |
| `x-ratelimit-resource` | Which bucket (`core`, `search`, …) |
| `retry-after` | Seconds to wait, sent with secondary-limit responses |

| Response | What it means | What RepoXray shows (AC3) |
|---|---|---|
| `403` or `429` with `x-ratelimit-remaining: 0` | Hourly limit used up | "GitHub's hourly limit for your network is used up. Try again at HH:MM." (from `x-ratelimit-reset`) |
| `403`/`429` with `retry-after` | Secondary (burst) limit | "GitHub asked us to slow down. Retrying in N s." Wait, then retry once. |
| `404` | Repo doesn't exist **or** is private (GitHub doesn't say which) | "Repo not found or not public" (AC2) |
| `304` | Conditional request, unchanged | Doesn't count against the limit; possible future caching trick |

## Git trees endpoint

`GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1`
- Returns every file path with `type`, `size` (bytes, for files) and `sha` in **one call**.
- Recursive responses are capped at **100,000 entries** or **7 MB**. If the repo is bigger, the response has `"truncated": true`.
- RepoXray treats `truncated: true` as "too large for v1". Our own 2,000-file cap kicks in long before this for normal JS/TS repos.

## raw.githubusercontent.com (file contents)

- Serves files at `https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}` with `Access-Control-Allow-Origin: *` (checked 20 Oct 2026), so the browser can fetch directly.
- **Not part of the REST API budget.** This is why v1 needs no proxy.
- ⚠️ **Its limits are not officially documented.** It's a CDN with its own abuse protection, and GitHub has been tightening limits on unauthenticated traffic since 2025. Some third-party reports put the soft limit at roughly 60–100 requests per minute per IP, but that's an observation, not an official number.

**What this means for v1:**
- A 425-file repo (hono) means 425 raw requests. At 8 in parallel that's well over 100 per minute, so we **must** handle `429` from raw.githubusercontent.com: honour `retry-after`, back off, and continue rather than fail the whole analysis.
- Test this early against the hono fixture (issue: *Download file contents with bounded concurrency*).
- If raw limits turn out to be tight in practice, options are: lower concurrency, or fall back to the [jsDelivr GitHub CDN](https://www.jsdelivr.com/?docs=gh) (`cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}`), or bring the proxy forward.

## Other GitHub limits worth knowing

- **Contents API** (`/repos/.../contents/{path}`) returns files up to 1 MB and costs one REST call each, which is why we don't use it.
- **Private repos** return `404` without a token, which matches the v1 "public only" scope.
