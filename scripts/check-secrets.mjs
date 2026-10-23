// Fails if anything that looks like a credential could reach the browser.
// RepoXray calls GitHub unauthenticated on purpose (docs/GITHUB_LIMITS.md):
// a token in client code is readable by every visitor.
//
// Scans the source, the HTML entry, public assets, CI config and, if it exists,
// the built site in dist/. Run after `npm run build` to cover the bundle.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const targets = ['src', 'public', 'index.html', '.github', 'dist'];
const textFile = /\.(m?[jt]sx?|c[jt]s|json|html|css|ya?ml|md|txt|svg|map)$/i;

const rules = [
  { name: 'GitHub token', re: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { name: 'Authorization header', re: /\bauthorization\s*["']?\s*:/i, skipTests: true },
  { name: 'Bearer/token auth scheme', re: /["'`](Bearer|token)\s+[A-Za-z0-9_\-.]{8,}/ },
  { name: 'Secret-looking Vite env var', re: /\bVITE_[A-Z0-9_]*(TOKEN|SECRET|KEY|PAT|PASSWORD)\b/ },
  { name: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

const isTest = (path) => /(\.test\.|\.spec\.|__fixtures__)/.test(path);

function* walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) if (name !== 'node_modules') yield* walk(join(path, name));
  } else if (textFile.test(path)) {
    yield path;
  }
}

const findings = [];
for (const target of targets) {
  for (const file of walk(join(root, target))) {
    const rel = relative(root, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const rule of rules) {
        if (rule.skipTests && isTest(rel)) continue;
        if (rule.re.test(line)) findings.push(`${rel}:${i + 1}  ${rule.name}`);
      }
    });
  }
}

// Env files are never committed; .env.example would be fine if it ever exists.
for (const name of readdirSync(root)) {
  if (/^\.env(\..+)?$/.test(name) && name !== '.env.example')
    findings.push(`${name}  env file in the repo root`);
}

if (findings.length) {
  console.error('Possible credentials found. RepoXray must stay token-free in client code:\n');
  for (const f of findings) console.error('  ' + f);
  process.exit(1);
}
console.log(`No credentials found (${targets.filter((t) => existsSync(join(root, t))).join(', ')}).`);
