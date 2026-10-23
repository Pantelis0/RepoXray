import { describe, expect, it, vi } from 'vitest';
import {
  createCallBudget,
  fetchRepoMeta,
  fetchRepoTree,
  GITHUB_API,
  isSafeRef,
  MAX_API_CALLS_PER_ANALYSIS,
  repoApiUrl,
  treeApiUrl,
} from './github';
import realTree from './__fixtures__/repoxray-tree.json';
import { parseRepoUrl } from './parseRepoUrl';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const reactBody = {
  name: 'react',
  owner: { login: 'facebook' },
  default_branch: 'main',
  html_url: 'https://github.com/facebook/react',
  private: false,
};

describe('repoApiUrl', () => {
  it('always targets api.github.com with encoded path parts', () => {
    expect(repoApiUrl({ owner: 'facebook', repo: 'react' })).toBe(`${GITHUB_API}/repos/facebook/react`);
    expect(repoApiUrl({ owner: 'a', repo: 'b?c#d/e' })).toBe(`${GITHUB_API}/repos/a/b%3Fc%23d%2Fe`);
  });

  it('never lets user input change the host', () => {
    const inputs = [
      'https://github.com.evil.com/a/b',
      'https://evil.com/github.com/a/b',
      'javascript:alert(1)',
      'https://user@github.com/a/b',
      'https://github.com/a/b',
      'a/b',
      'git@github.com:a/b.git',
    ];
    for (const input of inputs) {
      const parsed = parseRepoUrl(input);
      if (!parsed.ok) continue;
      expect(new URL(repoApiUrl(parsed.value)).host).toBe('api.github.com');
    }
  });
});

describe('fetchRepoMeta', () => {
  const online = () => true;

  it('requests the API URL built from the parsed repo, not the raw input', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, reactBody),
    );
    await fetchRepoMeta({ owner: 'facebook', repo: 'react' }, { fetchImpl, isOnline: online });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.github.com/repos/facebook/react');
  });

  it('returns the default branch, header details and the canonical names', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        ...reactBody,
        name: 'react',
        owner: { login: 'react' },
        description: 'The library for web and native user interfaces.',
        stargazers_count: 241000,
        language: 'JavaScript',
        archived: false,
        fork: false,
      }),
    );
    const result = await fetchRepoMeta({ owner: 'facebook', repo: 'react' }, { fetchImpl, isOnline: online });
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'react',
        repo: 'react',
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/react/react',
        description: 'The library for web and native user interfaces.',
        stars: 241000,
        language: 'JavaScript',
        archived: false,
        fork: false,
      },
    });
  });

  it('copes with missing optional fields (no description, no language)', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        name: 'RepoXray',
        owner: { login: 'Pantelis0' },
        default_branch: 'main',
        description: null,
      }),
    );
    const result = await fetchRepoMeta(
      { owner: 'Pantelis0', repo: 'RepoXray' },
      { fetchImpl, isOnline: online },
    );
    expect(result).toMatchObject({ ok: true, value: { description: null, language: null, stars: 0 } });
  });

  it('flags archived repos and forks', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...reactBody, archived: true, fork: true }));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: true, value: { archived: true, fork: true } });
  });

  it('maps 451 and non-rate-limit 403 to "blocked"', async () => {
    for (const status of [451, 403]) {
      const fetchImpl = vi.fn(async () => json(status, {}));
      const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
      expect(result).toMatchObject({ ok: false, error: { kind: 'blocked' } });
    }
  });

  it('rejects a default branch that would be unsafe in a URL path', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...reactBody, default_branch: '../../users' }));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unexpected' } });
  });

  it('maps 404 to "not found or not public"', async () => {
    const fetchImpl = vi.fn(async () => json(404, { message: 'Not Found' }));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('treats a private repo as not found', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...reactBody, private: true }));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('reports the hourly rate limit with its reset time', async () => {
    const reset = Math.floor(Date.UTC(2026, 9, 22, 14, 42) / 1000);
    const fetchImpl = vi.fn(async () =>
      json(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) }),
    );
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('rate-limited');
      expect(result.error.message).toMatch(/hourly limit/);
      expect(result.error.message).toMatch(/Try again at/);
    }
  });

  it('reports secondary rate limits using retry-after', async () => {
    const fetchImpl = vi.fn(async () => json(429, {}, { 'retry-after': '30' }));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
    if (!result.ok) expect(result.error.message).toMatch(/30 seconds/);
  });

  it('reports other errors with their status', async () => {
    const fetchImpl = vi.fn(async () => json(502, {}));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unexpected', status: 502 } });
  });

  it('does not call GitHub when offline', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: () => false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { kind: 'offline' } });
  });

  it('reports network failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'network' } });
  });

  it('times out slow responses', async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const result = await fetchRepoMeta(
      { owner: 'a', repo: 'b' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, isOnline: online, timeoutMs: 20 },
    );
    expect(result).toMatchObject({ ok: false, error: { kind: 'timeout' } });
  });

  it('reports a cancelled request as aborted', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const pending = fetchRepoMeta(
      { owner: 'a', repo: 'b' },
      { fetchImpl: fetchImpl as unknown as typeof fetch, isOnline: online, signal: controller.signal },
    );
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { kind: 'aborted' } });
  });
});

describe('isSafeRef / treeApiUrl', () => {
  it('accepts normal branch and tag names, including ones with slashes', () => {
    for (const ref of ['main', 'v5.3.0', 'release/v2', 'feature/a-b_c']) expect(isSafeRef(ref)).toBe(true);
  });

  it('rejects refs that could escape /git/trees/', () => {
    for (const ref of ['', '..', 'a/../b', './x', 'a//b', '/main', 'main/', 'a b', 'a?b', 'a#b', '%2e%2e']) {
      expect(isSafeRef(ref), ref).toBe(false);
    }
    expect(() => treeApiUrl({ owner: 'a', repo: 'b' }, '../x')).toThrow();
  });

  it('builds the recursive tree URL on the fixed host', () => {
    expect(treeApiUrl({ owner: 'honojs', repo: 'hono' }, 'main')).toBe(
      'https://api.github.com/repos/honojs/hono/git/trees/main?recursive=1',
    );
    const url = new URL(treeApiUrl({ owner: 'a', repo: 'b' }, 'release/v2'));
    expect(url.host).toBe('api.github.com');
    expect(url.pathname).toBe('/repos/a/b/git/trees/release/v2');
  });
});

describe('fetchRepoTree', () => {
  const online = () => true;
  const repo = { owner: 'Pantelis0', repo: 'RepoXray' };

  it('reads a real GitHub tree response', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, realTree));
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/Pantelis0/RepoXray/git/trees/main?recursive=1',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sha).toBe(realTree.sha);
      expect(result.value.entries).toHaveLength(realTree.tree.length);
      const ci = result.value.entries.find((e) => e.path === '.github/workflows/ci.yml');
      expect(ci).toMatchObject({ type: 'blob', mode: '100644' });
      expect(typeof ci?.size).toBe('number');
    }
  });

  it('keeps only path, type, mode, size and the blob sha', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, {
        sha: 'abc',
        truncated: false,
        tree: [
          { path: 'a.ts', type: 'blob', mode: '100644', size: 5, sha: 'x', url: 'https://evil.example' },
        ],
      }),
    );
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toEqual({
      ok: true,
      value: { sha: 'abc', entries: [{ path: 'a.ts', type: 'blob', mode: '100644', size: 5, sha: 'x' }] },
    });
  });

  it('stops with "too large" when GitHub truncates the tree', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...realTree, truncated: true }));
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'too-large' } });
  });

  it('explains a missing branch or tag (404)', async () => {
    const fetchImpl = vi.fn(async () => json(404, { message: 'Not Found', status: '404' }));
    const result = await fetchRepoTree(repo, 'nope-branch', { fetchImpl, isOnline: online });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('ref-not-found');
      expect(result.error.message).toContain('nope-branch');
      expect(result.error.message).toContain('Pantelis0/RepoXray');
    }
  });

  it('explains an empty repo (409)', async () => {
    const fetchImpl = vi.fn(async () => json(409, { message: 'Git Repository is empty.' }));
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'empty' } });
  });

  it('shares rate-limit handling with the metadata call', async () => {
    const fetchImpl = vi.fn(async () =>
      json(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792500000' }),
    );
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
  });

  it('refuses an unsafe ref without making a request', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchRepoTree(repo, '../../users/x', { fetchImpl, isOnline: online });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { kind: 'ref-not-found' } });
  });

  it('rejects a response that is not a tree', async () => {
    const fetchImpl = vi.fn(async () => json(200, { message: 'hello' }));
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unexpected' } });
  });
});

describe('rate limits on either call (403 and 429)', () => {
  const online = () => true;
  const repo = { owner: 'a', repo: 'b' };
  const limited = (status: number) =>
    json(status, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792500000' });

  it.each([403, 429])('metadata call: %i with 0 remaining is the hourly limit', async (status) => {
    const result = await fetchRepoMeta(repo, {
      fetchImpl: vi.fn(async () => limited(status)),
      isOnline: online,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
    if (!result.ok) expect(result.error.message).toMatch(/hourly limit/);
  });

  it.each([403, 429])('tree call: %i with 0 remaining is the hourly limit', async (status) => {
    const result = await fetchRepoTree(repo, 'main', {
      fetchImpl: vi.fn(async () => limited(status)),
      isOnline: online,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
  });

  it('tree call: 429 with retry-after is a secondary limit', async () => {
    const fetchImpl = vi.fn(async () => json(429, {}, { 'retry-after': '45' }));
    const result = await fetchRepoTree(repo, 'main', { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'rate-limited' } });
    if (!result.ok) expect(result.error.message).toMatch(/45 seconds/);
  });

  it('a 429 without rate-limit headers is still reported, not treated as success', async () => {
    const result = await fetchRepoMeta(repo, {
      fetchImpl: vi.fn(async () => json(429, {})),
      isOnline: online,
    });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unexpected', status: 429 } });
  });
});

describe('call budget', () => {
  const online = () => true;
  const repo = { owner: 'a', repo: 'b' };

  it('allows exactly two GitHub API calls per analysis', () => {
    expect(MAX_API_CALLS_PER_ANALYSIS).toBe(2);
    const budget = createCallBudget(MAX_API_CALLS_PER_ANALYSIS);
    expect([budget.take(), budget.take(), budget.take()]).toEqual([true, true, false]);
    expect(budget.used).toBe(2);
  });

  it('refuses a third call without touching the network and says the analysis is incomplete', async () => {
    const fetchImpl = vi.fn(async () => json(200, reactBody));
    const budget = createCallBudget(MAX_API_CALLS_PER_ANALYSIS);
    const opts = { fetchImpl, isOnline: online, budget };
    await fetchRepoMeta(repo, opts);
    await fetchRepoMeta(repo, opts);
    const third = await fetchRepoMeta(repo, opts);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(third).toMatchObject({ ok: false, error: { kind: 'over-budget' } });
    if (!third.ok) expect(third.error.message).toMatch(/incomplete/);
  });

  it('does not spend budget when offline or when a ref is refused', async () => {
    const budget = createCallBudget(1);
    await fetchRepoMeta(repo, { fetchImpl: vi.fn(), isOnline: () => false, budget });
    await fetchRepoTree(repo, '../x', { fetchImpl: vi.fn(), isOnline: online, budget });
    expect(budget.used).toBe(0);
  });
});

describe('no credentials', () => {
  it('sends every request without an Authorization header or credentials', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/git/trees/') ? json(200, realTree) : json(200, reactBody),
    );
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch, isOnline: () => true };
    await fetchRepoMeta({ owner: 'a', repo: 'b' }, opts);
    await fetchRepoTree({ owner: 'a', repo: 'b' }, 'main', opts);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls as unknown as [string, RequestInit][]) {
      const headers = new Headers(init.headers);
      expect(headers.has('authorization')).toBe(false);
      expect([...headers.keys()]).toEqual(['accept']);
      expect(init.credentials).toBeUndefined();
    }
  });
});
