// The only module that talks to GitHub. Every request URL is built from a
// validated RepoRef against a fixed host: user input is never fetched directly.

import type { RepoRef } from './parseRepoUrl';

export const GITHUB_API = 'https://api.github.com';

export interface RepoMeta {
  owner: string;
  repo: string;
  defaultBranch: string;
  htmlUrl: string;
}

export type RepoMetaError =
  | { kind: 'not-found'; message: string }
  | { kind: 'rate-limited'; message: string; resetAt?: Date }
  | { kind: 'offline'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'aborted'; message: string }
  | { kind: 'unexpected'; message: string; status?: number };

export type RepoMetaResult = { ok: true; value: RepoMeta } | { ok: false; error: RepoMetaError };

/** GET /repos/{owner}/{repo}. Path parts are URL-encoded; the host never changes. */
export function repoApiUrl({ owner, repo }: Pick<RepoRef, 'owner' | 'repo'>): string {
  return `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

export interface FetchOptions {
  /** Abort the request, e.g. when the user submits another repo. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to navigator.onLine. */
  isOnline?: () => boolean;
}

const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function rateLimitError(res: Response): RepoMetaError | null {
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  const retryAfter = res.headers.get('retry-after');

  if (remaining === '0') {
    const resetAt = reset ? new Date(Number(reset) * 1000) : undefined;
    const when = resetAt && !Number.isNaN(resetAt.getTime()) ? ` Try again at ${formatTime(resetAt)}.` : '';
    return {
      kind: 'rate-limited',
      message: `GitHub’s hourly limit for your network is used up.${when}`,
      resetAt,
    };
  }
  if (retryAfter) {
    return {
      kind: 'rate-limited',
      message: `GitHub asked us to slow down. Try again in ${retryAfter} seconds.`,
    };
  }
  return null;
}

/** Checks a repo exists and is public, and finds its default branch. */
export async function fetchRepoMeta(ref: RepoRef, options: FetchOptions = {}): Promise<RepoMetaResult> {
  const {
    signal,
    timeoutMs = 10_000,
    fetchImpl = globalThis.fetch.bind(globalThis),
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  } = options;

  if (!isOnline()) {
    return { ok: false, error: { kind: 'offline', message: 'You’re offline. Reconnect and try again.' } };
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetchImpl(repoApiUrl(ref), {
      headers: { Accept: 'application/vnd.github+json' },
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) {
      return { ok: false, error: { kind: 'aborted', message: 'Cancelled.' } };
    }
    if (timeout.aborted || (err instanceof DOMException && err.name === 'TimeoutError')) {
      return {
        ok: false,
        error: { kind: 'timeout', message: 'GitHub took too long to respond. Try again in a moment.' },
      };
    }
    if (!isOnline()) {
      return { ok: false, error: { kind: 'offline', message: 'You’re offline. Reconnect and try again.' } };
    }
    return {
      ok: false,
      error: { kind: 'network', message: 'Couldn’t reach GitHub. Check your connection and try again.' },
    };
  }

  if (res.status === 404) {
    return { ok: false, error: { kind: 'not-found', message: 'Repo not found or not public.' } };
  }
  if (res.status === 403 || res.status === 429) {
    const limited = rateLimitError(res);
    if (limited) return { ok: false, error: limited };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: {
        kind: 'unexpected',
        status: res.status,
        message: `GitHub returned an unexpected error (${res.status}). Try again in a moment.`,
      },
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      error: { kind: 'unexpected', message: 'GitHub sent a response we couldn’t read. Try again.' },
    };
  }

  const data = body as {
    name?: unknown;
    owner?: { login?: unknown };
    default_branch?: unknown;
    html_url?: unknown;
    private?: unknown;
  };
  if (data.private === true) {
    return { ok: false, error: { kind: 'not-found', message: 'Repo not found or not public.' } };
  }
  if (
    typeof data.name !== 'string' ||
    typeof data.owner?.login !== 'string' ||
    typeof data.default_branch !== 'string'
  ) {
    return {
      ok: false,
      error: { kind: 'unexpected', message: 'GitHub sent a response we couldn’t read. Try again.' },
    };
  }

  // GitHub follows renames, so use the names it returns rather than the ones typed.
  const owner = data.owner.login;
  const repo = data.name;
  return {
    ok: true,
    value: {
      owner,
      repo,
      defaultBranch: data.default_branch,
      htmlUrl: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    },
  };
}
