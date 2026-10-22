import { useEffect, useMemo, useRef, useState } from 'react';
import { GraphView } from './components/GraphView';
import { UrlForm } from './components/UrlForm';
import { folderColors } from './lib/folderColors';
import { fetchRepoMeta, type RepoMeta } from './lib/github';
import { formatRepoRef, type RepoRef } from './lib/parseRepoUrl';
import { sampleGraph } from './lib/sampleGraph';

type CheckStatus =
  | { kind: 'idle' }
  | { kind: 'checking'; ref: RepoRef }
  | { kind: 'found'; meta: RepoMeta; branch: string }
  | { kind: 'error'; ref: RepoRef; message: string };

export default function App() {
  const graph = sampleGraph;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<CheckStatus>({ kind: 'idle' });
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
    setStatus({ kind: 'checking', ref });

    const result = await fetchRepoMeta(ref, { signal: controller.signal });
    if (controller.signal.aborted) return;
    inFlight.current = null;

    if (result.ok) {
      setStatus({ kind: 'found', meta: result.value, branch: ref.ref ?? result.value.defaultBranch });
    } else if (result.error.kind !== 'aborted') {
      setStatus({ kind: 'error', ref, message: result.error.message });
    }
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
          busy={status.kind === 'checking'}
          onAnalyse={handleAnalyse}
          onEdit={() => setStatus((s) => (s.kind === 'checking' ? s : { kind: 'idle' }))}
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

      <section className="canvas-card" aria-label="Import graph">
        <div className="canvas-card__bar">
          <div>
            <strong>Sample graph</strong>
            <span className="muted"> · RepoXray’s own planned file structure (hand-written data)</span>
          </div>
          <ul className="legend" aria-label="Folder colours">
            {Object.entries(colors).map(([folder, color]) => (
              <li key={folder}>
                <span className="legend__swatch" style={{ background: color }} aria-hidden="true" />
                {folder || '(root)'}
              </li>
            ))}
          </ul>
        </div>

        <div className="canvas">
          <GraphView graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="canvas-card__foot" aria-live="polite">
          {selectedId && selection ? (
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
              Click a file to see what it imports and what imports it. Drag to rearrange, scroll to zoom.
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
      {status.kind === 'found' && (
        <p className="status status--found">
          Found{' '}
          <a href={status.meta.htmlUrl} target="_blank" rel="noopener noreferrer">
            {status.meta.owner}/{status.meta.repo}
          </a>{' '}
          (branch: <code>{status.branch}</code>). Import analysis is next, so the graph below is still sample
          data.
        </p>
      )}
      {status.kind === 'error' && (
        <p className="status status--error" role="alert">
          <code>{formatRepoRef(status.ref)}</code>: {status.message}
        </p>
      )}
    </div>
  );
}
