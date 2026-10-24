# Test fixtures

Three real public repositories used to check RepoXray end to end (README **AC14**) and as snapshot tests for the parser and resolver.

All three are **MIT-licensed**, so reading their code to build a graph is permitted. RepoXray only reads files; it never copies them into this repo. Snapshot tests store our _output_ (graph JSON), not their source.

Pin each fixture to the commit below so results don't drift. Bump the commit deliberately and update the expected numbers when you do.

|                              | [chalk/chalk](https://github.com/chalk/chalk) | [pmndrs/zustand](https://github.com/pmndrs/zustand) | [honojs/hono](https://github.com/honojs/hono) |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Role                         | **Small JS**                                  | **Small TS + React**                                | **Mid-size TS**                               |
| Licence                      | MIT                                           | MIT                                                 | MIT                                           |
| Pinned commit (`main`)       | `47fc05a`                                     | `d7a5583`                                           | `5ca49b0`                                     |
| Analysable files*            | 14                                            | 51                                                  | 452                                           |
| …of which `.mts` / `.cts`    | 0                                             | 1                                                   | 27                                            |
| Roles: source / test / types | 5 / 8 / 1                                     | 34 / 15 / 2                                         | 288 / 162 / 2                                 |
| Files over 500 KB            | 0                                             | 0                                                   | 0                                             |
| Relative import statements*  | 18                                            | 46                                                  | 1,054                                         |
| `@/` alias imports           | 0                                             | 0                                                   | 3                                             |
| Main folders                 | `source/`, `test/`, `examples/`               | `src/`, `tests/`, `examples/`                       | `src/`, `adapters/`, `benchmarks/`            |

\*Counted on 20 Oct 2026 with the v1 filter from [ARCHITECTURE.md](ARCHITECTURE.md) (eight extensions since 23 Oct, when `.mts`/`.cts` were added; vendored, build and generated code removed, see README "Ignored paths"). Since 24 Oct `vendor/` folders are skipped too, which removes chalk's 6 files in `source/vendor/`: imports into them will show as skipped, not unresolved. Import count is a rough `grep`, so treat it as a sanity range, not an exact expected edge count.

## What each one tests

**chalk: small JS, ESM**

- Plain `.js` ES modules with relative imports into `source/vendor/`.
- `.d.ts` files importing `./vendor/....js`: exercises resolution rule 4 (a `.js` specifier that maps to a `.ts`/`.d.ts` file).
- Graph should be small enough to check every edge by hand.

**zustand: small TS + React**

- `.ts` and `.tsx` files: exercises the `typescript` + `jsx` parser plugins.
- Extensionless imports (`./vanilla`) and `index` resolution.
- `examples/` folder gives a separate cluster, a good test of colour by top-level folder.

**hono: mid-size TS**

- ~450 files (288 of them production source), close to the 500-file performance target (**AC10**: paste to graph under 10 s).
- Deep `../../` relative paths and many `export … from` re-exports.
- 3 `@/` alias imports, which must be **ignored** (v1 does not resolve aliases) and must not crash anything.
- Large enough to surface rate-limit behaviour on `raw.githubusercontent.com` (see [GITHUB_LIMITS.md](GITHUB_LIMITS.md)).

## Inventory check against GitHub (D06, 24 Oct 2026)

Each repo's real file list came from `git ls-tree -r` on a fresh clone at the commit shown. A separate script that doesn't import any RepoXray code applied the README filter rules to that list. Then the same list went through the app: `filterTree` directly, and the Files panel in a browser with every toggle on and every page loaded.

| Repo           | Why                            | Commit    | GitHub files | JS/TS | Skipped (vendor/build) | Kept  | Source / test / types | Folders | Result                   |
| -------------- | ------------------------------ | --------- | ------------ | ----- | ---------------------- | ----- | --------------------- | ------- | ------------------------ |
| chalk/chalk    | Normal, small                  | `7211001` | 35           | 20    | 6 (`source/vendor/`)   | 14    | 5 / 8 / 1             | 3       | Same paths, counts match |
| pmndrs/zustand | Nested (`examples/demo/src/…`) | `382d29c` | 144          | 51    | 0                      | 51    | 34 / 15 / 2           | 15      | Same paths, counts match |
| honojs/hono    | Nested, mid-size               | `5ca49b0` | 583          | 458   | 6 (`build/`)           | 452   | 288 / 162 / 2         | 121     | Same paths, counts match |
| vitejs/vite    | Many files                     | `82e7aa0` | 2,909        | 1,633 | 10                     | 1,623 | 1,176 / 415 / 32      | 742     | Same paths, counts match |

What was checked, per repo:

- **Same file list.** The kept paths are identical to the independent script's list, not just the same count.
- **Folder counts.** Every folder's count matches, all 742 of them in vite, down to `packages/vite/src/node/ssr/runtime/__tests__/fixtures/cyclic2/test7/dom` (2 files).
- **Total files.** The total equals GitHub's file count.
- **In the browser.** Exactly 2 API calls. The first page is capped at 500 rows, and "Show more" reaches all 1,623 vite files.
- **Same tree either way.** For hono, the API tree (fixture) and the git listing at the same commit have identical paths and sizes.

**Bug found and fixed.** vite has 5 symlinks. They were left out of the total, so the header said 2,904 files while GitHub says 2,909. Symlinks now count towards the total, matching GitHub, but they're still never analysed.

**Not covered by these repos:** none of the four has a JS/TS file over 500 KB, so the "too large" path is covered only by unit and UI tests.

**Finding for later:** 1,110 of vite's 1,623 kept files are in `playground/`. They're example apps rather than library source, so `examples/` and `playground/` probably deserve their own hidden-by-default role, like tests.

## Expected-result checklist (fill in once the parser exists)

| Fixture | Nodes | Edges | Unresolved    | Parse errors | Time to graph |
| ------- | ----- | ----- | ------------- | ------------ | ------------- |
| chalk   | 14    | _tbd_ | _tbd_         | 0            | _tbd_         |
| zustand | 51    | _tbd_ | _tbd_         | 0            | _tbd_         |
| hono    | 452   | _tbd_ | ≥ 3 (aliases) | 0            | < 10 s        |

## Many-files fixture

`vitejs/vite` at `82e7aa0` (2,909 files, 1,623 JS/TS) is stored as `src/lib/__fixtures__/trees/vite.json` (paths, modes and sizes only). It exercises the 500-row paging and is the closest real repo to the 2,000-file limit.

## Backup candidates

If one of the above stops being suitable (archived, licence change, grows past the limits): `lukeed/kleur` (small JS, MIT), `pmndrs/jotai` (TS, MIT), `sindresorhus/ky` (TS, MIT). Check licence and file count before swapping.
