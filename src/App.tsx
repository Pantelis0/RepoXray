import { useEffect, useMemo, useRef, useState } from 'react';
import { GraphView } from './components/GraphView';
import { FileInventory } from './components/FileInventory';
import { RepoHeader } from './components/RepoHeader';
import { UrlForm } from './components/UrlForm';
import { fileLimitMessage, filterTree, type TreeSummary } from './lib/filterTree';
import { folderColors } from './lib/folderColors';
import {
  createCallBudget,
  fetchRepoMeta,
  fetchRepoTree,
  MAX_API_CALLS_PER_ANALYSIS,
  type RepoMeta,
} from './lib/github';
import { formatRepoRef, type RepoRef } from './lib/parseRepoUrl';
import { graphFromSummary } from './lib/repoGraph';
import { sampleGraph } from './lib/sampleGraph';

type CheckStatus =
  | { kind: 'idle' }
  | { kind: 'checking'; ref: RepoRef }
  | { kind: 'reading-tree'; ref: RepoRef; meta: RepoMeta; branch: string }
  | { kind: 'ready'; ref: RepoRef; meta: RepoMeta; branch: string; summary: TreeSummary }
  /** The repo exists but can't be analysed (no branch, empty, too large…). */
  | {
      kind: 'repo-problem';
      ref: RepoRef;
      meta: RepoMeta;
      branch: string;
      message: string;
      summary?: TreeSummary;
    }
  | { kind: 'error'; ref: RepoRef; message: string };

const isBusy = (s: CheckStatus) => s.kind === 'checking' || s.kind === 'reading-tree';

export default function App() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });
  // A real repo replaces the sample as soon as its file list is ready.
  const real = status.kind === 'ready' && status.summary.sourceFiles.some((f) => f.role === 'source');
  const graph = useMemo(
    () =>
      status.kind === 'ready' && real
        ? graphFromSummary(status.meta, status.branch, status.summary)
        : sampleGraph,
    [status, real],
  );
  const folderCount = useMemo(
    () => new Set(graph.nodes.map((n) => n.id.slice(0, Math.max(0, n.id.lastIndexOf('/'))))).size,
    [graph],
  );
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const colors = useMemo(() => folderColors(graph.nodes.map((n) => n.folder)), [graph]);

  const selection = useMemo(() => {
    if (!selectedId) return null;
    return {
      imports: graph.edges.filter((e) => e.source === selectedId).map((e) => e.target),
      importedBy: graph.edges.filter((e) => e.target === selectedId).map((e) => e.source),
    };
  }, [graph, selectedId]);

  async function handleAnalyse(ref: RepoRef) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setSelectedId(null);
    setStatus({ kind: 'checking', ref });
    // One budget per analysis: a bug can never spend more than this many of the
    // visitor's 60 unauthenticated calls an hour.
    const budget = createCallBudget(MAX_API_CALLS_PER_ANALYSIS);

    // Call 1 of 2: does the repo exist, is it public, what's its default branch?
    const metaResult = await fetchRepoMeta(ref, { signal: controller.signal, budget });
    if (controller.signal.aborted) return;
    if (!metaResult.ok) {
      inFlight.current = null;
      if (metaResult.error.kind !== 'aborted')
        setStatus({ kind: 'error', ref, message: metaResult.error.message });
      return;
    }
    const meta = metaResult.value;
    const branch = ref.ref ?? meta.defaultBranch;
    setStatus({ kind: 'reading-tree', ref, meta, branch });

    // Call 2 of 2: every path in the repo, in one request.
    const treeResult = await fetchRepoTree(meta, branch, { signal: controller.signal, budget });
    if (controller.signal.aborted) return;
    inFlight.current = null;
    if (!treeResult.ok) {
      if (treeResult.error.kind !== 'aborted') {
        setStatus({ kind: 'repo-problem', ref, meta, branch, message: treeResult.error.message });
      }
      return;
    }

    const summary = filterTree(treeResult.value.entries);
    const overLimit = fileLimitMessage(summary);
    setStatus(
      overLimit
        ? { kind: 'repo-problem', ref, meta, branch, message: overLimit, summary }
        : { kind: 'ready', ref, meta, branch, summary },
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">RepoXray</span>
          <span className="brand__badge">pre-alpha</span>
        </div>
        <nav className="app-header__nav" aria-label="Links">
          <a className="app-header__link" href="https://github.com/Pantelis0/RepoXray">
            GitHub
          </a>
          <a
            className="waitlist-link"
            href="https://tally.so/r/1WAKM4"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join the waitlist
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>See how a JS/TS repo fits together.</h1>
        <p className="hero__lede">
          Paste any public GitHub URL and see exactly how its JS/TS files import each other. No install, no AI
          guesswork.
        </p>
        <UrlForm
          busy={isBusy(status)}
          onAnalyse={handleAnalyse}
          onEdit={() => {
            setStatus((s) => (isBusy(s) ? s : { kind: 'idle' }));
            setSelectedId(null);
          }}
        />
        <RepoStatus status={status} />
        <p className="hero__waitlist">
          Want early access when it ships (target 17 Nov)?{' '}
          <a href="https://tally.so/r/1WAKM4" target="_blank" rel="noopener noreferrer">
            Join the waitlist
          </a>
          .
        </p>
      </section>

      {status.kind === 'ready' && (
        <FileInventory
          key={`${status.meta.owner}/${status.meta.repo}@${status.branch}`}
          summary={status.summary}
        />
      )}

      <section className="canvas-card" aria-label="Import graph">
        <div className="canvas-card__bar">
          {real ? (
            <div>
              <strong>
                {graph.repo.owner}/{graph.repo.name}
              </strong>
              <span className="muted">
                {' '}
                · {graph.nodes.length.toLocaleString('en')} source files in {folderCount.toLocaleString('en')}{' '}
                {folderCount === 1 ? 'folder' : 'folders'} ·{' '}
              </span>
              <span className="canvas-card__pending">import edges coming next</span>
            </div>
          ) : (
            <div>
              <strong>Sample graph</strong>
              <span className="muted"> · RepoXray’s own planned file structure (hand-written data)</span>
            </div>
          )}
          <ul className="legend" aria-label="Folder colours">
            {Object.entries(colors)
              .slice(0, 8)
              .map(([folder, color]) => (
                <li key={folder}>
                  <span className="legend__swatch" style={{ background: color }} aria-hidden="true" />
                  {folder || '(root)'}
                </li>
              ))}
            {Object.keys(colors).length > 8 && (
              <li className="muted">+{Object.keys(colors).length - 8} more</li>
            )}
          </ul>
        </div>

        <div className="canvas">
          <GraphView
            graph={graph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            layout={real ? 'folders' : 'force'}
          />
        </div>

        <div className="canvas-card__foot" aria-live="polite">
          {selectedId && selection && real ? (
            <>
              <code>{selectedId}</code>
              <span className="muted">Imports for this file are analysed in the next step.</span>
            </>
          ) : selectedId && selection ? (
            <>
              <code>{selectedId}</code>
              <span>
                <span className="key key--imports" aria-hidden="true" /> imports {selection.imports.length}
              </span>
              <span>
                <span className="key key--imported-by" aria-hidden="true" /> imported by{' '}
                {selection.importedBy.length}
              </span>
            </>
          ) : (
            <span className="muted">
              {real
                ? 'Each box is a folder. Drag to pan, scroll to zoom, click a file to select it.'
                : 'Click a file to see what it imports and what imports it. Drag to rearrange, scroll to zoom.'}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function RepoStatus({ status }: { status: CheckStatus }) {
  // Kept mounted so screen readers announce each change.
  return (
    <div className="repo-status" aria-live="polite">
      {status.kind === 'checking' && (
        <p className="status status--checking">
          <span className="spinner" aria-hidden="true" /> Checking <code>{formatRepoRef(status.ref)}</code> on
          GitHub…
        </p>
      )}
      {status.kind === 'reading-tree' && (
        <p className="status status--checking">
          <span className="spinner" aria-hidden="true" /> Reading the file tree of{' '}
          <code>
            {status.meta.owner}/{status.meta.repo}
          </code>{' '}
          (<code>{status.branch}</code>)…
        </p>
      )}
      {status.kind === 'ready' && (
        <RepoHeader
          meta={status.meta}
          branch={status.branch}
          requested={status.ref}
          summary={status.summary}
        />
      )}
      {status.kind === 'repo-problem' && (
        <RepoHeader
          meta={status.meta}
          branch={status.branch}
          requested={status.ref}
          summary={status.summary}
          problem={status.message}
        />
      )}
      {status.kind === 'error' && (
        <p className="status status--error" role="alert">
          <code>{formatRepoRef(status.ref)}</code>: {status.message}
        </p>
      )}
    </div>
  );
}
