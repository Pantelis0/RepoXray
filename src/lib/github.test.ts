import { describe, expect, it, vi } from 'vitest';
import { fetchRepoMeta, GITHUB_API, repoApiUrl } from './github';
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

  it('returns the default branch and the canonical names', async () => {
    const fetchImpl = vi.fn(async () => json(200, { ...reactBody, owner: { login: 'Facebook' } }));
    const result = await fetchRepoMeta({ owner: 'facebook', repo: 'react' }, { fetchImpl, isOnline: online });
    expect(result).toEqual({
      ok: true,
      value: {
        owner: 'Facebook',
        repo: 'react',
        defaultBranch: 'main',
        htmlUrl: 'https://github.com/Facebook/react',
      },
    });
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
    const fetchImpl = vi.fn(async () => json(500, {}));
    const result = await fetchRepoMeta({ owner: 'a', repo: 'b' }, { fetchImpl, isOnline: online });
    expect(result).toMatchObject({ ok: false, error: { kind: 'unexpected', status: 500 } });
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
