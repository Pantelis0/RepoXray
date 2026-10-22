import { describe, expect, it } from 'vitest';
import { formatRepoRef, MAX_INPUT_LENGTH, parseRepoUrl } from './parseRepoUrl';

describe('parseRepoUrl: accepted inputs', () => {
  it.each([
    ['facebook/react', 'facebook', 'react'],
    ['https://github.com/facebook/react', 'facebook', 'react'],
    ['http://github.com/facebook/react', 'facebook', 'react'],
    ['github.com/facebook/react', 'facebook', 'react'],
    ['www.github.com/facebook/react', 'facebook', 'react'],
    ['https://www.github.com/facebook/react', 'facebook', 'react'],
    ['HTTPS://GitHub.com/facebook/react', 'facebook', 'react'],
    ['https://github.com/facebook/react/', 'facebook', 'react'],
    ['https://github.com/facebook/react.git', 'facebook', 'react'],
    ['facebook/react.git', 'facebook', 'react'],
    ['facebook/react/', 'facebook', 'react'],
    ['  https://github.com/facebook/react  ', 'facebook', 'react'],
    ['https://github.com/facebook/react?tab=readme-ov-file', 'facebook', 'react'],
    ['https://github.com/facebook/react#readme', 'facebook', 'react'],
    ['git@github.com:facebook/react.git', 'facebook', 'react'],
    ['git@github.com:facebook/react', 'facebook', 'react'],
    ['ssh://git@github.com/facebook/react.git', 'facebook', 'react'],
    ['https://github.com/vercel/next.js', 'vercel', 'next.js'],
    ['https://github.com/a-b/c_d.e-f', 'a-b', 'c_d.e-f'],
    ['https://github.com/facebook/react/tree', 'facebook', 'react'],
  ])('%s → %s/%s', (input, owner, repo) => {
    expect(parseRepoUrl(input)).toEqual({ ok: true, value: { owner, repo } });
  });

  it('keeps the branch from a /tree/<ref> URL', () => {
    expect(parseRepoUrl('https://github.com/honojs/hono/tree/next')).toEqual({
      ok: true,
      value: { owner: 'honojs', repo: 'hono', ref: 'next' },
    });
    expect(parseRepoUrl('github.com/chalk/chalk/tree/v5.3.0').ok).toBe(true);
  });
});

describe('parseRepoUrl: rejected inputs', () => {
  const rejects = (input: string, pattern: RegExp) => {
    const result = parseRepoUrl(input);
    expect(result.ok, input).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  };

  it('empty, whitespace-only, too long, or containing spaces', () => {
    rejects('', /paste/i);
    rejects('    ', /paste/i);
    rejects('https://github.com/a/' + 'b'.repeat(MAX_INPUT_LENGTH), /too long/i);
    rejects('facebook / react', /spaces/i);
  });

  it('other hosts', () => {
    rejects('https://gitlab.com/gitlab-org/gitlab', /GitLab/);
    rejects('https://bitbucket.org/owner/repo', /Bitbucket/);
    rejects('https://gist.github.com/someone/abc123', /Gists/);
    rejects('https://raw.githubusercontent.com/facebook/react/main/package.json', /raw file/);
    rejects('https://facebook.github.io/react', /GitHub Pages/);
    rejects('https://example.com/facebook/react', /only works with github\.com/);
  });

  it('look-alike and tricky URLs', () => {
    rejects('https://github.com.evil.com/facebook/react', /only works with github\.com/);
    rejects('https://githubb.com/facebook/react', /only works with github\.com/);
    rejects('https://evil.com/github.com/facebook/react', /only works with github\.com/);
    rejects('https://user@github.com/facebook/react', /username or password/);
    rejects('https://user:pass@github.com/facebook/react', /username or password/);
    rejects('https://github.com:8443/facebook/react', /Only https/);
  });

  it('non-web schemes', () => {
    rejects('javascript:alert(1)', /Only https/);
    rejects('file:///etc/passwd', /Only https/);
    rejects('ftp://github.com/facebook/react', /Only https/);
  });

  it('GitHub pages that are not repos', () => {
    rejects('https://github.com', /Add the repo/);
    rejects('https://github.com/facebook', /profile, not a repo/);
    rejects('https://github.com/settings/profile', /GitHub page/);
    rejects('https://github.com/marketplace/actions', /GitHub page/);
    rejects('https://github.com/orgs/vercel/repositories', /GitHub page/);
  });

  it('pages inside a repo, with a one-click fix', () => {
    const cases: Array<[string, RegExp]> = [
      ['https://github.com/facebook/react/blob/main/package.json', /a file/],
      ['https://github.com/facebook/react/issues/123', /issue/],
      ['https://github.com/facebook/react/pull/42', /pull request/],
      ['https://github.com/facebook/react/actions', /Actions/],
      ['https://github.com/facebook/react/something-new', /page inside the repo/],
    ];
    for (const [input, pattern] of cases) {
      const result = parseRepoUrl(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(pattern);
        expect(result.suggestion).toBe('facebook/react');
      }
    }
  });

  it('branch names with "/" and folder links', () => {
    const result = parseRepoUrl('https://github.com/facebook/react/tree/feature/x');
    expect(result).toMatchObject({ ok: false, suggestion: 'facebook/react' });
    rejects('https://github.com/facebook/react/tree/main/packages', /aren’t supported yet/);
  });

  it('invalid owner and repo names', () => {
    rejects('-bad/repo', /valid GitHub username/);
    rejects('bad-/repo', /valid GitHub username/);
    rejects('a'.repeat(40) + '/repo', /valid GitHub username/);
    rejects('under_score/repo', /valid GitHub username/);
    rejects('owner/re po', /spaces/);
    rejects('owner/r$po', /valid repository name/);
    rejects('owner/..', /valid repository name/);
    rejects('owner/.git', /valid repository name/);
    rejects('https://github.com/owner/' + 'r'.repeat(101), /valid repository name/);
    rejects('https://github.com/owner/%E0%A4%A', /characters/);
  });

  it('extra path segments in shorthand are not treated as owner/repo', () => {
    expect(parseRepoUrl('a/b/c').ok).toBe(false);
  });
});

describe('formatRepoRef', () => {
  it('shows the branch only when there is one', () => {
    expect(formatRepoRef({ owner: 'a', repo: 'b' })).toBe('a/b');
    expect(formatRepoRef({ owner: 'a', repo: 'b', ref: 'dev' })).toBe('a/b @ dev');
  });
});
