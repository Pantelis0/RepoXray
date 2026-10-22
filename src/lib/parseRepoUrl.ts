// Turns whatever the user pastes into { owner, repo, ref? } — or a clear,
// friendly error — without touching the network. See issue #2.

export interface RepoRef {
  owner: string;
  repo: string;
  /** Branch or tag from a `/tree/<ref>` URL. Undefined means "default branch". */
  ref?: string;
}

export type ParseResult =
  | { ok: true; value: RepoRef }
  | {
      ok: false;
      error: string;
      /** A corrected `owner/repo` the UI can offer as a one-click fix. */
      suggestion?: string;
    };

export const MAX_INPUT_LENGTH = 300;

// GitHub usernames: 1–39 chars, letters/digits/hyphens, no leading/trailing hyphen.
const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
// Repo names: 1–100 chars of letters, digits, `.`, `_`, `-`.
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
// Single-segment branch or tag names. Refs containing `/` are a v1 limitation.
const REF_RE = /^[A-Za-z0-9._-]{1,255}$/;

const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

// First path segments that are GitHub's own pages, not users or orgs.
const RESERVED = new Set([
  'about',
  'account',
  'apps',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'dashboard',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'join',
  'login',
  'logout',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'organizations',
  'pricing',
  'pulls',
  'readme',
  'search',
  'security',
  'settings',
  'signup',
  'site',
  'sponsors',
  'team',
  'topics',
  'trending',
  'users',
]);

// Pages inside a repo, and how to describe them to the user.
const SUBPAGES: Record<string, string> = {
  blob: 'a file',
  raw: 'a file',
  issues: 'an issue page',
  pull: 'a pull request',
  pulls: 'the pull requests page',
  commit: 'a commit',
  commits: 'the commits page',
  actions: 'the Actions page',
  wiki: 'the wiki',
  releases: 'the releases page',
  discussions: 'the discussions page',
  compare: 'a comparison page',
  branches: 'the branches page',
  tags: 'the tags page',
  projects: 'the projects page',
  security: 'the security page',
  settings: 'the settings page',
  network: 'the network page',
  graphs: 'the insights page',
  pulse: 'the insights page',
  milestones: 'the milestones page',
  labels: 'the labels page',
};

const fail = (error: string, suggestion?: string): ParseResult =>
  suggestion ? { ok: false, error, suggestion } : { ok: false, error };

function stripGitSuffix(name: string): string {
  return name.toLowerCase().endsWith('.git') ? name.slice(0, -4) : name;
}

function checkNames(owner: string, rawRepo: string): ParseResult {
  const repo = stripGitSuffix(rawRepo);
  if (!OWNER_RE.test(owner)) {
    return fail(`"${owner}" isn't a valid GitHub username or organisation.`);
  }
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') {
    return fail(`"${rawRepo}" isn't a valid repository name.`);
  }
  return { ok: true, value: { owner, repo } };
}

function safeDecode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseRepoUrl(input: string): ParseResult {
  const text = input.trim();

  if (!text) return fail('Paste a GitHub repo URL or owner/repo.');
  if (text.length > MAX_INPUT_LENGTH) return fail('That’s too long to be a GitHub repo URL.');
  if (/\s/.test(text)) return fail('Repo URLs can’t contain spaces.');

  // SSH clone URL: git@github.com:owner/repo(.git)
  const ssh = /^git@github\.com:([^/]+)\/([^/]+?)\/?$/i.exec(text);
  if (ssh) return checkNames(ssh[1], ssh[2]);

  // Shorthand: owner/repo. Usernames can't contain dots, so "github.com/x" isn't shorthand.
  const short = /^([^/:.]+)\/([^/:]+?)\/?$/.exec(text);
  if (short) return checkNames(short[1], short[2]);

  // Anything else must be a URL. Add https:// if it was left off.
  let candidate = text;
  if (/^ssh:\/\/git@github\.com\//i.test(candidate)) {
    candidate = 'https://github.com/' + candidate.slice('ssh://git@github.com/'.length);
  } else if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate)) {
    candidate = 'https://' + candidate;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fail('That doesn’t look like a GitHub repo. Try https://github.com/owner/repo or owner/repo.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('Only https://github.com links are supported.');
  }
  if (url.username || url.password) {
    return fail('Links with a username or password in them aren’t supported.');
  }
  if (url.port) {
    return fail('Only https://github.com links are supported.');
  }

  const host = url.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(host)) {
    if (host === 'gist.github.com') return fail('Gists aren’t supported, only repositories.');
    if (host === 'raw.githubusercontent.com' || host.endsWith('.githubusercontent.com')) {
      return fail('That’s a link to a raw file. Paste the repo URL instead.');
    }
    if (host.endsWith('.github.io')) {
      return fail('That’s a GitHub Pages website. Paste the repo URL from github.com instead.');
    }
    if (host === 'gitlab.com' || host.endsWith('.gitlab.com')) {
      return fail('GitLab isn’t supported yet. RepoXray works with public GitHub repos.');
    }
    if (host === 'bitbucket.org') {
      return fail('Bitbucket isn’t supported yet. RepoXray works with public GitHub repos.');
    }
    return fail('RepoXray only works with github.com repos.');
  }

  const segments: string[] = [];
  for (const raw of url.pathname.split('/').filter(Boolean)) {
    const decoded = safeDecode(raw);
    if (decoded === null) return fail('That URL has characters GitHub repo names can’t contain.');
    segments.push(decoded);
  }

  if (segments.length === 0) return fail('Add the repo to the URL: github.com/owner/repo.');

  const [owner, rawRepo, subpage, ...rest] = segments;

  if (RESERVED.has(owner.toLowerCase())) {
    return fail('That’s a GitHub page, not a repository. Paste a link like github.com/owner/repo.');
  }
  if (rawRepo === undefined) {
    return fail(
      `That’s a profile, not a repo. Paste one of ${owner}’s repos, like github.com/${owner}/repo-name.`,
    );
  }

  const names = checkNames(owner, rawRepo);
  if (!names.ok) return names;
  const { repo } = names.value;
  const fix = `${owner}/${repo}`;

  if (subpage === undefined) return names;

  if (subpage === 'tree') {
    if (rest.length === 0) return names;
    if (rest.length === 1 && REF_RE.test(rest[0]) && !rest[0].includes('..')) {
      return { ok: true, value: { owner, repo, ref: rest[0] } };
    }
    return fail(
      'Folder links and branch names containing "/" aren’t supported yet. Paste the repo itself.',
      fix,
    );
  }

  const what = SUBPAGES[subpage.toLowerCase()] ?? 'a page inside the repo';
  return fail(`That’s a link to ${what}. Paste the repo instead: github.com/${fix}`, fix);
}

/** Display form, e.g. "facebook/react" or "facebook/react @ dev". */
export function formatRepoRef({ owner, repo, ref }: RepoRef): string {
  return ref ? `${owner}/${repo} @ ${ref}` : `${owner}/${repo}`;
}
