# RepoXray

> **Paste any public GitHub URL and see exactly how its JS/TS files import each other. No install, no AI guesswork.**

**Status:** v1 in development · 30-day build-in-public challenge (19 Oct – 17 Nov 2026)

**[→ Join the waitlist](https://tally.so/r/1WAKM4)** for early access when v1 ships · follow the build on [X @pntlsk](https://x.com/pntlsk)

---

## What it does (v1)

1. **Paste** a public GitHub repository URL (e.g. `https://github.com/owner/repo`).
2. **See** every JS/TS source file as a node, and every relative import between them as an edge.
3. **Explore** — search for a file by name/path, click a node to highlight what it imports and what imports it.

That's it. v1 does one thing well: turns "where does this file get used?" into a picture.

**Stack:** React + Vite + TypeScript, React Flow, runs entirely in the browser. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data flow, limits and design decisions.

---

## How RepoXray compares

| Tool                                                                                                                          | Install needed?                                              | Level                                    | Visual?                                    | Price                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| [Madge](https://github.com/pahen/madge)                                                                                       | Yes: npm CLI, plus Graphviz for images, run on a local clone | File                                     | Static image (SVG/PNG)                     | Free (MIT)                                    |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)                                                          | Yes: npm CLI + config, run on a local clone                  | File                                     | Generates dot/Mermaid/HTML you then render | Free (MIT)                                    |
| [GitDiagram](https://gitdiagram.com)                                                                                          | No: paste a URL                                              | Folder/component, AI-generated           | Interactive Mermaid diagram                | Free (MIT)                                    |
| [GitHub dependency graph](https://docs.github.com/en/code-security/concepts/supply-chain-security/about-the-dependency-graph) | No: built into public repos                                  | Package (from `package.json`/lock files) | Searchable list, not a graph               | Free                                          |
| [Sourcegraph](https://sourcegraph.com/search)                                                                                 | No for public search; self-host/Enterprise for teams         | Symbol/text (search, find references)    | Search results, no file graph              | Public search free; Enterprise only for teams |

**Where RepoXray fits:** the only one that is zero-install _and_ file-level _and_ an interactive graph. Every edge comes from parsing real import statements, so nothing is guessed.

---

## Scope

### In scope for v1

| Area               | What's included                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Input**          | Public GitHub repo URL. Optional branch/tag via `/tree/<ref>`; defaults to the default branch.                                                                   |
| **Files analysed** | `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`                                                                                                                     |
| **Edges detected** | Relative imports only (paths starting with `./` or `../`): `import … from`, `export … from`, `import()` with a string literal, `require()` with a string literal |
| **Resolution**     | Extensionless paths (`./utils` → `utils.ts`, `utils.js`, …) and directory index files (`./lib` → `lib/index.ts`)                                                 |
| **Graph view**     | Interactive force-directed graph; nodes coloured by top-level folder; pan, zoom, drag                                                                            |
| **Search**         | Filter/jump to nodes by file name or path substring                                                                                                              |
| **Node click**     | Highlight the node, its outgoing imports and incoming dependents; side panel shows path, imports list, imported-by list, and a link to the file on GitHub        |
| **Ignored paths**  | `node_modules/`, `dist/`, `build/`, `.next/`, `coverage/`, minified files (`*.min.js`)                                                                           |

### Exclusions (explicitly NOT in v1)

- **No private repositories.** No GitHub login, no tokens requested from users. Public repos only.
- **No arbitrary code execution.** RepoXray reads source files as text and parses them statically. It never installs dependencies, runs build scripts, or executes repository code.
- **No AI promises.** No AI summaries, "explain this codebase", chat, or LLM features. Every edge shown comes from deterministic parsing.
- **No package / external imports.** `import React from "react"` is not drawn. Only file-to-file relative imports.
- **No alias resolution.** `tsconfig` `paths`, webpack/Vite aliases (`@/components`) are not resolved in v1.
- **No other languages.** Python, Go, etc. are out of scope.
- **No accounts, saving, or sharing** of graphs.
- **No monorepo-specific handling** (workspaces are treated as plain folders).

---

## Limits

- Repos up to **~2,000 analysable files**. Larger repos show a clear message rather than hanging.
- Subject to GitHub's unauthenticated API rate limits; when hit, the user sees a readable error with retry guidance.

---

## Acceptance criteria (definition of done for v1)

v1 ships when **all** of these pass:

**Input & fetching**

- [ ] AC1 — Pasting a valid public repo URL starts analysis; invalid URLs show an inline error without a network call.
- [ ] AC2 — Private or non-existent repos show "Repo not found or not public" (no crash, no stack trace).
- [ ] AC3 — Rate-limit and network errors show a human-readable message.
- [ ] AC4 — A loading state is visible during fetch and parse.

**Parsing**

- [ ] AC5 — All six supported extensions appear as nodes; ignored folders do not.
- [ ] AC6 — The four import forms listed above produce edges; package imports produce none.
- [ ] AC7 — Extensionless and `index` imports resolve to the correct file.
- [ ] AC8 — A file with a syntax error is still shown as a node and does not stop the rest of the analysis.
- [ ] AC9 — Parser has unit tests covering each import form and resolution rule.

**Graph & interaction**

- [ ] AC10 — Graph renders for a ~500-file repo in under 10 seconds on a normal laptop connection.
- [ ] AC11 — Searching a file name highlights matches and centres the first result.
- [ ] AC12 — Clicking a node highlights its imports and dependents and opens the side panel with a working GitHub link.
- [ ] AC13 — Clicking empty space clears the selection.

**Verified against real repos**

- [ ] AC14 — Produces a correct-looking graph for at least 3 known public repos (one small JS, one TS, one mid-size app), spot-checked by hand.

**Project hygiene**

- [ ] AC15 — Deployed at a public URL.
- [ ] AC16 — README has a demo GIF/screenshot, setup instructions, and this scope section.
- [ ] AC17 — MIT licence, `CONTRIBUTING.md`, and issue templates in place.

---

## 30-day delivery criteria

| Week | Dates          | Milestone       | Done when                                                                                 |
| ---- | -------------- | --------------- | ----------------------------------------------------------------------------------------- |
| 1    | 19 – 25 Oct    | **Foundations** | Scope locked (this doc), repo set up, URL parsing + GitHub fetch of file tree working     |
| 2    | 26 Oct – 1 Nov | **Parser**      | Import extraction + path resolution with tests (AC5–AC9)                                  |
| 3    | 2 – 8 Nov      | **Graph UI**    | Graph renders, search and click working (AC10–AC13)                                       |
| 4    | 9 – 17 Nov     | **Ship**        | Error handling polished, tested on real repos, deployed, launch post (AC1–AC4, AC14–AC17) |

**Challenge success = v1 deployed + all acceptance criteria ticked by 17 Nov 2026**, with progress posted publicly throughout.

---

## Issue backlog

**Live tracking:** the v1 work is in [GitHub Issues](https://github.com/Pantelis0/RepoXray/issues) (#1–#10, grouped into weekly [milestones](https://github.com/Pantelis0/RepoXray/milestones)), each with success criteria. The list below is the original planning backlog; its numbers are planning IDs, not issue numbers.

Labels: `v1` (must ship), `stretch`, `post-v1`.

### v1 — Setup

1. **#1** Initialise repo: framework, linting, formatting, CI running tests `v1`
2. **#2** Add MIT licence, `CONTRIBUTING.md`, issue/PR templates `v1`

### v1 — Input & fetch

3. **#3** Parse and validate GitHub URL (owner, repo, optional ref) `v1`
4. **#4** Fetch repo file tree via GitHub API `v1`
5. **#5** Filter supported extensions and ignored paths `v1`
6. **#6** Fetch file contents (batched, with concurrency limit) `v1`
7. **#7** Error states: not found/private, rate limit, network, too large `v1`

### v1 — Parser

8. **#8** Extract static `import` / `export … from` specifiers `v1`
9. **#9** Extract `require()` and literal `import()` specifiers `v1`
10. **#10** Resolve relative paths, extensions and `index` files `v1`
11. **#11** Tolerate unparseable files (node kept, no edges) `v1`
12. **#12** Unit tests for parser and resolver `v1`

### v1 — Graph UI

13. **#13** Build node/edge data model from parse results `v1`
14. **#14** Render force-directed graph with pan/zoom/drag `v1`
15. **#15** Colour nodes by top-level folder + legend `v1`
16. **#16** Search box: filter and centre on matching node `v1`
17. **#17** Click node: highlight neighbours + side panel with GitHub link `v1`
18. **#18** Loading and empty states `v1`

### v1 — Ship

19. **#19** Test against 3 real public repos and log results `v1`
20. **#20** Performance check on ~500-file repo `v1`
21. **#21** Deploy to public URL `v1`
22. **#22** README screenshots + demo GIF `v1`

### Stretch (only if v1 is done early)

23. **#23** Shareable URL (`?repo=owner/name`) that auto-loads a graph `stretch`
24. **#24** Highlight orphan files (no imports in or out) `stretch`
25. **#25** Detect and flag circular imports `stretch`
26. **#26** Cache results per repo + commit SHA `stretch`

### Post-v1 ideas

27. **#27** Resolve `tsconfig` path aliases `post-v1`
28. **#28** Optional GitHub sign-in for private repos `post-v1`
29. **#29** Additional languages (Python first) `post-v1`
30. **#30** Folder-level collapse/cluster view for large repos `post-v1`

---

## Getting started

Requires **Node.js 20.19+** (22 recommended).

```bash
git clone https://github.com/Pantelis0/RepoXray.git
cd RepoXray
npm install
npm run dev        # http://localhost:5173
```

Right now the home screen shows a **sample graph** (hand-written data of RepoXray's own planned structure). Pasting a URL doesn't fetch anything yet; that arrives with issues #2–#8.

| Script                            | What it does                            |
| --------------------------------- | --------------------------------------- |
| `npm run dev`                     | Start the dev server with hot reload    |
| `npm run build`                   | Typecheck and build to `dist/`          |
| `npm run preview`                 | Serve the production build locally      |
| `npm run typecheck`               | TypeScript only                         |
| `npm run lint`                    | Lint with oxlint                        |
| `npm run format` / `format:check` | Format with Prettier / check formatting |
| `npm test`                        | Run unit tests once (Vitest)            |
| `npm run check`                   | Everything CI runs except the build     |

CI runs typecheck, lint, format check, tests and build on every push and pull request.

## Contributing

Issues and PRs welcome — please check the scope above first so v1 stays focused.

## Licence

MIT
