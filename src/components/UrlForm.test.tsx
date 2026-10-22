// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UrlForm } from './UrlForm';

afterEach(cleanup);

const setup = (busy = false) => {
  const onAnalyse = vi.fn();
  render(<UrlForm busy={busy} onAnalyse={onAnalyse} />);
  return {
    onAnalyse,
    user: userEvent.setup(),
    input: screen.getByLabelText(/public github repository url/i) as HTMLInputElement,
    button: screen.getByRole('button', { name: busy ? /checking/i : /analyse/i }),
  };
};

describe('UrlForm', () => {
  it('previews the normalised repo while typing', async () => {
    const { user, input } = setup();
    await user.type(input, 'https://github.com/facebook/react.git');
    expect(screen.getByText('facebook/react')).toBeTruthy();
  });

  it('submits only the parsed repo, never the raw text', async () => {
    const { user, input, onAnalyse } = setup();
    await user.type(input, '  https://www.github.com/facebook/react/tree/main?x=1  ');
    await user.keyboard('{Enter}');
    expect(onAnalyse).toHaveBeenCalledWith({ owner: 'facebook', repo: 'react', ref: 'main' });
  });

  it('shows an error linked to the input and does not submit', async () => {
    const { user, input, button, onAnalyse } = setup();
    await user.type(input, 'https://gitlab.com/a/b');
    await user.click(button);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/GitLab/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(onAnalyse).not.toHaveBeenCalled();
  });

  it('asks for input when submitted empty', async () => {
    const { user, button, onAnalyse } = setup();
    await user.click(button);
    expect(screen.getByRole('alert').textContent).toMatch(/paste/i);
    expect(onAnalyse).not.toHaveBeenCalled();
  });

  it('offers a one-click fix for links inside a repo', async () => {
    const { user, input, button } = setup();
    await user.type(input, 'https://github.com/facebook/react/issues/1');
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Use facebook/react' }));
    expect(input.value).toBe('facebook/react');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('clears the error as soon as the user edits the input', async () => {
    const { user, input, button } = setup();
    await user.type(input, 'nope');
    await user.click(button);
    expect(screen.getByRole('alert')).toBeTruthy();
    await user.type(input, 'x');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('cannot be submitted again while busy', async () => {
    const { user, input, button, onAnalyse } = setup(true);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(input, 'facebook/react{Enter}');
    expect(onAnalyse).not.toHaveBeenCalled();
  });
});
