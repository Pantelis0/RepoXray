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

## Expected-result checklist (fill in once the parser exists)

| Fixture | Nodes | Edges | Unresolved    | Parse errors | Time to graph |
| ------- | ----- | ----- | ------------- | ------------ | ------------- |
| chalk   | 14    | _tbd_ | _tbd_         | 0            | _tbd_         |
| zustand | 51    | _tbd_ | _tbd_         | 0            | _tbd_         |
| hono    | 452   | _tbd_ | ≥ 3 (aliases) | 0            | < 10 s        |

## Backup candidates

If one of the above stops being suitable (archived, licence change, grows past the limits): `lukeed/kleur` (small JS, MIT), `pmndrs/jotai` (TS, MIT), `sindresorhus/ky` (TS, MIT). Check licence and file count before swapping.
