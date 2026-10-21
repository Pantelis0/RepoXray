import { useMemo, useState } from 'react';
import { GraphView } from './components/GraphView';
import { UrlForm } from './components/UrlForm';
import { folderColors } from './lib/folderColors';
import { sampleGraph } from './lib/sampleGraph';

export default function App() {
  const graph = sampleGraph;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const colors = useMemo(() => folderColors(graph.nodes.map((n) => n.folder)), [graph]);

  const selection = useMemo(() => {
    if (!selectedId) return null;
    return {
      imports: graph.edges.filter((e) => e.source === selectedId).map((e) => e.target),
      importedBy: graph.edges.filter((e) => e.target === selectedId).map((e) => e.source),
    };
  }, [graph, selectedId]);

  function handleSubmit(url: string) {
    // Real analysis lands in issues #2–#8. Until then, be honest about it.
    setNotice(
      url
        ? `Repo analysis isn't built yet, so "${url}" wasn't fetched. Below is a sample graph.`
        : 'Paste a public GitHub repo URL. (Analysis isn’t built yet; below is a sample graph.)',
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
        <UrlForm onSubmit={handleSubmit} />
        <p className="hero__waitlist">
          Want early access when it ships (target 17 Nov)?{' '}
          <a href="https://tally.so/r/1WAKM4" target="_blank" rel="noopener noreferrer">
            Join the waitlist
          </a>
          .
        </p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
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
