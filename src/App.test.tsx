// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import realTree from './lib/__fixtures__/repoxray-tree.json';

// React Flow needs real layout APIs; the canvas isn't what's under test here.
vi.mock('./components/GraphView', () => ({ GraphView: () => <div data-testid="graph" /> }));

import App from './App';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const reactMeta = {
  name: 'react',
  owner: { login: 'react' },
  default_branch: 'main',
  description: 'The library for web and native user interfaces.',
  stargazers_count: 241_000,
  language: 'JavaScript',
  archived: false,
  fork: false,
};

type Route = (url: string) => Response | Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
const routes = (handlers: Record<string, Route>) =>
  fetchMock.mockImplementation(async (input: string) => {
    const url = String(input);
    for (const [match, handler] of Object.entries(handlers)) if (url.includes(match)) return handler(url);
    return json(500, { message: `unexpected ${url}` });
  });

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function analyse(text: string) {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText(/public github repository url/i), text);
  await user.click(screen.getByRole('button', { name: /analyse/i }));
  return user;
}

describe('App repo analysis', () => {
  it('checks the repo, reads the tree, then shows the header with file counts', async () => {
    let releaseTree!: () => void;
    routes({
      '/git/trees/': () => new Promise<Response>((r) => (releaseTree = () => r(json(200, realTree)))),
      '/repos/facebook/react': () => json(200, reactMeta),
    });

    await analyse('facebook/react');
    expect(await screen.findByText(/Reading the file tree/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /checking/i }) as HTMLButtonElement).disabled).toBe(true);

    releaseTree();
    const header = await screen.findByRole('article', { name: /Repository react\/react/ });
    expect(header.textContent).toContain('The library for web and native user interfaces.');
    expect(header.textContent).toMatch(/241K/);
    expect(header.textContent).toContain('JavaScript');
    expect(header.textContent).toMatch(/36 files/);
    expect(header.textContent).toMatch(/\d+ JS\/TS files/);
    expect(header.textContent).toMatch(/now lives at react\/react/);
    expect(screen.getByRole('link', { name: 'react/react' }).getAttribute('href')).toBe(
      'https://github.com/react/react',
    );

    // Exactly two GitHub calls, both on api.github.com, built from GitHub's canonical names.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/facebook/react');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.github.com/repos/react/react/git/trees/main?recursive=1',
    );
  });

  it('uses the branch from a /tree/<branch> link and explains when it does not exist', async () => {
    routes({
      '/git/trees/': () => json(404, { message: 'Not Found' }),
      '/repos/honojs/hono': () => json(200, { ...reactMeta, name: 'hono', owner: { login: 'honojs' } }),
    });
    await analyse('https://github.com/honojs/hono/tree/does-not-exist');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/no branch or tag called “does-not-exist” in honojs\/hono/);
    expect(fetchMock.mock.calls[1][0]).toContain('/git/trees/does-not-exist?recursive=1');
    // The header still shows, so you can see the repo itself was found.
    expect(screen.getByRole('article', { name: /honojs\/hono/ })).toBeTruthy();
  });

  it('explains an empty repo', async () => {
    routes({
      '/git/trees/': () => json(409, { message: 'Git Repository is empty.' }),
      '/repos/': () => json(200, { ...reactMeta, name: 'empty', owner: { login: 'me' } }),
    });
    await analyse('me/empty');
    expect((await screen.findByRole('alert')).textContent).toMatch(/This repo is empty/);
  });

  it('explains a truncated tree as too large', async () => {
    routes({
      '/git/trees/': () => json(200, { ...realTree, truncated: true }),
      '/repos/': () => json(200, reactMeta),
    });
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toMatch(/too large for v1/);
  });

  it('stops at the 2,000-file limit with the real count', async () => {
    const tree = Array.from({ length: 2_345 }, (_, i) => ({
      path: `src/f${i}.ts`,
      type: 'blob',
      mode: '100644',
      size: 10,
    }));
    routes({
      '/git/trees/': () => json(200, { sha: 'x', truncated: false, tree }),
      '/repos/': () => json(200, reactMeta),
    });
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This repo has 2,345 JS/TS files; v1 supports up to 2,000.',
    );
  });

  it('keeps the repo header when the tree call (call 2) hits the rate limit', async () => {
    routes({
      '/git/trees/': () => json(429, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792500000' }),
      '/repos/': () => json(200, reactMeta),
    });
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toMatch(/hourly limit/i);
    expect(screen.getByRole('article', { name: /react\/react/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows a secondary rate limit (429 + retry-after) on the first call', async () => {
    routes({ '/repos/': () => json(429, {}, { 'retry-after': '20' }) });
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toMatch(/20 seconds/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says the analysis is incomplete when files are over 500 KB', async () => {
    const tree = [
      { path: 'src/a.ts', type: 'blob', mode: '100644', size: 10 },
      { path: 'src/big.js', type: 'blob', mode: '100644', size: 600 * 1024 },
      { path: 'src/huge.js', type: 'blob', mode: '100644', size: 900 * 1024 },
    ];
    routes({
      '/git/trees/': () => json(200, { sha: 'x', truncated: false, tree }),
      '/repos/': () => json(200, reactMeta),
    });
    await analyse('facebook/react');
    const notice = await screen.findByRole('status');
    expect(notice.textContent).toBe(
      'Analysis incomplete: 2 files are over 500 KB, so they will show without imports.',
    );
  });

  it('shows no incomplete notice when every file can be read', async () => {
    routes({ '/git/trees/': () => json(200, realTree), '/repos/': () => json(200, reactMeta) });
    await analyse('facebook/react');
    await screen.findByText(/File list ready/);
    expect(screen.queryByText(/Analysis incomplete/)).toBeNull();
  });

  it('shows "not found or not public" for a 404 and never asks for the tree', async () => {
    routes({ '/repos/': () => json(404, { message: 'Not Found' }) });
    await analyse('someone/private-thing');
    expect((await screen.findByRole('alert')).textContent).toMatch(/not found or not public/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the rate-limit message', async () => {
    routes({
      '/repos/': () => json(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792500000' }),
    });
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toMatch(/hourly limit/i);
  });

  it('never calls the network for invalid input', async () => {
    await analyse('https://github.com.evil.com/a/b');
    expect(screen.getByRole('alert').textContent).toMatch(/only works with github\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears an old result when the user starts typing another repo', async () => {
    routes({ '/repos/': () => json(404, { message: 'Not Found' }) });
    const user = await analyse('someone/nope');
    expect(await screen.findByText(/not found or not public/i)).toBeTruthy();
    await user.type(screen.getByLabelText(/public github repository url/i), 'x');
    expect(screen.queryByText(/not found or not public/i)).toBeNull();
  });
});
