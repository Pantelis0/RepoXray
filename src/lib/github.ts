// The only module that talks to GitHub. Every request URL is built from
// validated names against a fixed host: user input is never fetched directly.

import type { RepoRef } from './parseRepoUrl';

export const GITHUB_API = 'https://api.github.com';

export interface RepoMeta {
  /** Canonical names from GitHub (it follows renames and transfers). */
  owner: string;
  repo: string;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  stars: number;
  language: string | null;
  archived: boolean;
  fork: boolean;
}

/** One entry of a recursive Git tree. Only what later steps need is kept. */
export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  /** Git file mode, e.g. "100644" (file), "100755" (executable), "120000" (symlink). */
  mode: string;
  /** Bytes, for blobs only. */
  size?: number;
  /** Git object id. Content-addressed, so it can key a download cache later. */
  sha?: string;
}

export interface RepoTree {
  sha: string;
  entries: TreeEntry[];
}

export type GitHubError =
  | { kind: 'not-found'; message: string }
  | { kind: 'ref-not-found'; message: string }
  | { kind: 'empty'; message: string }
  | { kind: 'too-large'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'rate-limited'; message: string; resetAt?: Date }
  | { kind: 'offline'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'timeout'; message: string }
  | { kind: 'aborted'; message: string }
  | { kind: 'over-budget'; message: string }
  | { kind: 'unexpected'; message: string; status?: number };

/** @deprecated use GitHubError */
export type RepoMetaError = GitHubError;

type Result<T> = { ok: true; value: T } | { ok: false; error: GitHubError };
export type RepoMetaResult = Result<RepoMeta>;
export type RepoTreeResult = Result<RepoTree>;

export interface FetchOptions {
  /** Abort the request, e.g. when the user submits another repo. */
  signal?: AbortSignal;
  /** Shared cap on GitHub calls for one analysis. Every request spends one call. */
  budget?: CallBudget;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests; defaults to navigator.onLine. */
  isOnline?: () => boolean;
}

const enc = encodeURIComponent;

/**
 * Calls one analysis may make to api.github.com: repo metadata + the recursive
 * tree. Unauthenticated users get 60 an hour, so a bug must never be able to
 * loop. File downloads (raw.githubusercontent.com) get their own budget later.
 */
export const MAX_API_CALLS_PER_ANALYSIS = 2;

export interface CallBudget {
  readonly max: number;
  readonly used: number;
  /** Spends one call. False (and nothing spent) once the budget is gone. */
  take(): boolean;
}

export function createCallBudget(max: number): CallBudget {
  let used = 0;
  return {
    max,
    get used() {
      return used;
    },
    take() {
      if (used >= max) return false;
      used++;
      return true;
    },
  };
}

// Branch or tag names as Git allows them, minus anything that could step
// outside /git/trees/ when placed in the URL path.
const SAFE_REF_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function isSafeRef(ref: string): boolean {
  return ref.length <= 255 && SAFE_REF_RE.test(ref) && !ref.split('/').some((s) => s === '.' || s === '..');
}

/** GET /repos/{owner}/{repo} */
export function repoApiUrl({ owner, repo }: Pick<RepoRef, 'owner' | 'repo'>): string {
  return `${GITHUB_API}/repos/${enc(owner)}/${enc(repo)}`;
}

/** GET /repos/{owner}/{repo}/git/trees/{ref}?recursive=1 — each ref segment encoded separately. */
export function treeApiUrl({ owner, repo }: Pick<RepoRef, 'owner' | 'repo'>, ref: string): string {
  if (!isSafeRef(ref)) throw new Error(`Unsafe ref: ${ref}`);
  const encodedRef = ref.split('/').map(enc).join('/');
  return `${repoApiUrl({ owner, repo })}/git/trees/${encodedRef}?recursive=1`;
}

const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fail = <T>(error: GitHubError): Result<T> => ({ ok: false, error });

const UNREADABLE: GitHubError = {
  kind: 'unexpected',
  message: 'GitHub sent a response we couldn’t read. Try again.',
};

function rateLimitError(res: Response): GitHubError | null {
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

/**
 * Sends one GET to the GitHub API and turns transport problems and shared
 * status codes into GitHubErrors. Endpoint-specific statuses (404, 409) are
 * left for the caller.
 */
async function request(url: string, options: FetchOptions): Promise<Result<Response>> {
  const {
    signal,
    budget,
    timeoutMs = 10_000,
    fetchImpl = globalThis.fetch.bind(globalThis),
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  } = options;

  if (!isOnline()) {
    return fail({ kind: 'offline', message: 'You’re offline. Reconnect and try again.' });
  }
  if (budget && !budget.take()) {
    return fail({
      kind: 'over-budget',
      message: `RepoXray stopped after ${budget.max} GitHub calls for this repo, so the analysis is incomplete. Please report this as a bug.`,
    });
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let res: Response;
  try {
    // Deliberately unauthenticated: no Authorization header and no token anywhere in client code.
    res = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' }, signal: combined });
  } catch (err) {
    if (signal?.aborted) return fail({ kind: 'aborted', message: 'Cancelled.' });
    if (timeout.aborted || (err instanceof DOMException && err.name === 'TimeoutError')) {
      return fail({ kind: 'timeout', message: 'GitHub took too long to respond. Try again in a moment.' });
    }
    if (!isOnline()) return fail({ kind: 'offline', message: 'You’re offline. Reconnect and try again.' });
    return fail({ kind: 'network', message: 'Couldn’t reach GitHub. Check your connection and try again.' });
  }

  if (res.status === 403 || res.status === 429) {
    const limited = rateLimitError(res);
    if (limited) return fail(limited);
  }
  if (res.status === 451) {
    return fail({ kind: 'blocked', message: 'GitHub has blocked access to this repo.' });
  }
  return { ok: true, value: res };
}

async function readJson(res: Response): Promise<unknown | undefined> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function unexpectedStatus(res: Response): GitHubError {
  return {
    kind: 'unexpected',
    status: res.status,
    message: `GitHub returned an unexpected error (${res.status}). Try again in a moment.`,
  };
}

/** Checks a repo exists and is public, and reads what the header shows. */
export async function fetchRepoMeta(ref: RepoRef, options: FetchOptions = {}): Promise<RepoMetaResult> {
  const sent = await request(repoApiUrl(ref), options);
  if (!sent.ok) return sent;
  const res = sent.value;

  if (res.status === 404) return fail({ kind: 'not-found', message: 'Repo not found or not public.' });
  if (res.status === 403) {
    return fail({ kind: 'blocked', message: 'GitHub has blocked access to this repo.' });
  }
  if (!res.ok) return fail(unexpectedStatus(res));

  const data = (await readJson(res)) as
    | {
        name?: unknown;
        owner?: { login?: unknown };
        default_branch?: unknown;
        private?: unknown;
        description?: unknown;
        stargazers_count?: unknown;
        language?: unknown;
        archived?: unknown;
        fork?: unknown;
      }
    | undefined;

  if (!data || typeof data !== 'object') return fail(UNREADABLE);
  if (data.private === true) return fail({ kind: 'not-found', message: 'Repo not found or not public.' });
  if (
    typeof data.name !== 'string' ||
    typeof data.owner?.login !== 'string' ||
    typeof data.default_branch !== 'string' ||
    !isSafeRef(data.default_branch)
  ) {
    return fail(UNREADABLE);
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
      htmlUrl: `https://github.com/${enc(owner)}/${enc(repo)}`,
      description: typeof data.description === 'string' && data.description.trim() ? data.description : null,
      stars: typeof data.stargazers_count === 'number' ? data.stargazers_count : 0,
      language: typeof data.language === 'string' ? data.language : null,
      archived: data.archived === true,
      fork: data.fork === true,
    },
  };
}

/** Reads every path in the repo at `ref` in one call. */
export async function fetchRepoTree(
  repoRef: Pick<RepoRef, 'owner' | 'repo'>,
  ref: string,
  options: FetchOptions = {},
): Promise<RepoTreeResult> {
  const name = `${repoRef.owner}/${repoRef.repo}`;
  if (!isSafeRef(ref)) {
    return fail({ kind: 'ref-not-found', message: `“${ref}” isn’t a branch or tag name RepoXray can read.` });
  }

  const sent = await request(treeApiUrl(repoRef, ref), options);
  if (!sent.ok) return sent;
  const res = sent.value;

  if (res.status === 404) {
    return fail({ kind: 'ref-not-found', message: `There’s no branch or tag called “${ref}” in ${name}.` });
  }
  if (res.status === 409) {
    return fail({ kind: 'empty', message: 'This repo is empty, so there are no files to map yet.' });
  }
  if (!res.ok) return fail(unexpectedStatus(res));

  const data = (await readJson(res)) as { sha?: unknown; truncated?: unknown; tree?: unknown } | undefined;
  if (!data || typeof data.sha !== 'string' || !Array.isArray(data.tree)) return fail(UNREADABLE);

  if (data.truncated === true) {
    return fail({
      kind: 'too-large',
      message: 'This repo is too large for v1: GitHub won’t list all of its files in one go.',
    });
  }

  const entries: TreeEntry[] = [];
  for (const raw of data.tree as unknown[]) {
    const e = raw as { path?: unknown; type?: unknown; mode?: unknown; size?: unknown; sha?: unknown };
    if (typeof e?.path !== 'string' || typeof e.mode !== 'string') continue;
    if (e.type !== 'blob' && e.type !== 'tree' && e.type !== 'commit') continue;
    entries.push({
      path: e.path,
      type: e.type,
      mode: e.mode,
      ...(typeof e.size === 'number' ? { size: e.size } : {}),
      ...(typeof e.sha === 'string' ? { sha: e.sha } : {}),
    });
  }

  return { ok: true, value: { sha: data.sha, entries } };
}
