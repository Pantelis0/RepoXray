// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// React Flow needs real layout APIs; the canvas isn't what's under test here.
vi.mock('./components/GraphView', () => ({ GraphView: () => <div data-testid="graph" /> }));

import App from './App';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;

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
}

describe('App repo check', () => {
  it('shows loading, then the repo and its default branch', async () => {
    let respond!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (respond = r)));

    await analyse('facebook/react');
    expect(await screen.findByText(/on GitHub…/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /checking/i }) as HTMLButtonElement).disabled).toBe(true);

    respond(json(200, { name: 'react', owner: { login: 'facebook' }, default_branch: 'main' }));
    expect(await screen.findByText(/Import analysis is next/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'facebook/react' }).getAttribute('href')).toBe(
      'https://github.com/facebook/react',
    );
    expect(fetchMock).toHaveBeenCalledWith('https://api.github.com/repos/facebook/react', expect.anything());
  });

  it('shows "not found or not public" for a 404', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'Not Found' }));
    await analyse('someone/private-thing');
    expect((await screen.findByRole('alert')).textContent).toMatch(/not found or not public/i);
  });

  it('shows the rate-limit message', async () => {
    fetchMock.mockResolvedValue(
      json(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792500000' }),
    );
    await analyse('facebook/react');
    expect((await screen.findByRole('alert')).textContent).toMatch(/hourly limit/i);
  });

  it('never calls the network for invalid input', async () => {
    await analyse('https://github.com.evil.com/a/b');
    expect(screen.getByRole('alert').textContent).toMatch(/only works with github\.com/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears an old result when the user starts typing another repo', async () => {
    fetchMock.mockResolvedValue(json(404, { message: 'Not Found' }));
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText(/public github repository url/i);
    await user.type(input, 'someone/nope');
    await user.click(screen.getByRole('button', { name: /analyse/i }));
    expect(await screen.findByText(/not found or not public/i)).toBeTruthy();
    await user.type(input, 'x');
    expect(screen.queryByText(/not found or not public/i)).toBeNull();
  });
});
