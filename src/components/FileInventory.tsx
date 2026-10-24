import { useId, useMemo, useState, type ReactNode } from 'react';
import type { FileRole, SkipReason, TreeSummary } from '../lib/filterTree';
import {
  buildFolderTree,
  coverage,
  filterFiles,
  formatSize,
  inventoryRows,
  ROW_PAGE,
  type InventoryRow,
} from '../lib/inventory';

const ROLE_LABEL: Record<Exclude<FileRole, 'source'>, [one: string, many: string]> = {
  test: ['test', 'tests'],
  story: ['story', 'stories'],
  types: ['type declaration', 'type declarations'],
};

const SKIP_LABEL: Record<SkipReason, string> = {
  folder: 'in a vendored or build folder',
  minified: 'minified',
  generated: 'generated',
};

const nf = new Intl.NumberFormat('en');
const plural = (n: number, [one, many]: [string, string]) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function FileInventory({ summary }: { summary: TreeSummary }) {
  const [roles, setRoles] = useState<ReadonlySet<FileRole>>(new Set());
  const [query, setQuery] = useState('');
  const [onlyTooLarge, setOnlyTooLarge] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(ROW_PAGE);
  const [showSkipped, setShowSkipped] = useState(false);
  const searchId = useId();
  const skippedId = useId();

  const cov = useMemo(() => coverage(summary), [summary]);
  const files = useMemo(
    () => filterFiles(summary.sourceFiles, { roles, query, onlyTooLarge }),
    [summary, roles, query, onlyTooLarge],
  );
  const rows = useMemo(
    // While searching, show every match: collapsed folders would hide results.
    () => inventoryRows(buildFolderTree(files), query.trim() ? new Set() : collapsed),
    [files, collapsed, query],
  );

  if (cov.total === 0) return null;

  const toggleRole = (role: FileRole) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
    setLimit(ROW_PAGE);
  };
  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const shown = rows.slice(0, limit);
  const hiddenRoles = (Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).filter(
    (r) => cov.byRole[r] > 0,
  );
  const partial = hiddenRoles.some((r) => !roles.has(r)) || cov.tooLarge > 0 || cov.skipped > 0;
  // What the graph will map: production source plus any roles switched on.
  const mapped = cov.mapped + hiddenRoles.reduce((n, r) => n + (roles.has(r) ? cov.byRole[r] : 0), 0);

  return (
    <section className="inventory" aria-labelledby={`${searchId}-title`}>
      <div className="inventory__head">
        <h2 id={`${searchId}-title`} className="inventory__title">
          Files
        </h2>
        <p className="inventory__coverage">
          Mapping <strong>{nf.format(mapped)}</strong> of {nf.format(cov.total)} JS/TS files
          {partial ? ': ' : '.'}
          {partial && (
            <CoverageParts
              cov={cov}
              roles={roles}
              hiddenRoles={hiddenRoles}
              onlyTooLarge={onlyTooLarge}
              showSkipped={showSkipped}
              skippedId={skippedId}
              onRole={toggleRole}
              onTooLarge={() => setOnlyTooLarge((v) => !v)}
              onSkipped={() => setShowSkipped((v) => !v)}
            />
          )}
        </p>
      </div>

      {showSkipped && cov.skipped > 0 && (
        <div id={skippedId} className="inventory__skipped">
          <p>
            Left out because they’re{' '}
            {(Object.keys(SKIP_LABEL) as SkipReason[])
              .filter((r) => summary.skippedByReason[r] > 0)
              .map((r) => `${SKIP_LABEL[r]} (${nf.format(summary.skippedByReason[r])})`)
              .join(', ')}
            . Nobody in the repo writes these by hand, so they’d only clutter the graph.
          </p>
          <ul>
            {summary.skippedSample.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>
              </li>
            ))}
          </ul>
          {cov.skipped > summary.skippedSample.length && (
            <p className="muted">…and {nf.format(cov.skipped - summary.skippedSample.length)} more.</p>
          )}
        </div>
      )}

      <div className="inventory__tools">
        <label htmlFor={searchId} className="visually-hidden">
          Filter files by path
        </label>
        <input
          id={searchId}
          type="search"
          placeholder="Filter by path, e.g. router"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(ROW_PAGE);
          }}
        />
        <div className="inventory__toggles" role="group" aria-label="Show file types">
          {hiddenRoles.map((role) => (
            <label key={role} className="chip">
              <input type="checkbox" checked={roles.has(role)} onChange={() => toggleRole(role)} />
              {ROLE_LABEL[role][1]} ({nf.format(cov.byRole[role])})
            </label>
          ))}
          {cov.tooLarge > 0 && (
            <label className="chip">
              <input type="checkbox" checked={onlyTooLarge} onChange={() => setOnlyTooLarge((v) => !v)} />
              only over 500 KB ({nf.format(cov.tooLarge)})
            </label>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="inventory__empty muted">No files match.</p>
      ) : (
        <ul className="inventory__list" aria-label="Repository files">
          {shown.map((row) => (
            <Row key={rowKey(row)} row={row} onToggle={toggleFolder} />
          ))}
        </ul>
      )}

      {rows.length > shown.length && (
        <p className="inventory__more">
          Showing {nf.format(shown.length)} of {nf.format(rows.length)} rows.{' '}
          <button type="button" className="link-button" onClick={() => setLimit((l) => l + ROW_PAGE)}>
            Show {nf.format(Math.min(ROW_PAGE, rows.length - shown.length))} more
          </button>
        </p>
      )}
    </section>
  );
}

function CoverageParts(props: {
  cov: ReturnType<typeof coverage>;
  roles: ReadonlySet<FileRole>;
  hiddenRoles: (keyof typeof ROLE_LABEL)[];
  onlyTooLarge: boolean;
  showSkipped: boolean;
  skippedId: string;
  onRole: (role: FileRole) => void;
  onTooLarge: () => void;
  onSkipped: () => void;
}) {
  const { cov, roles } = props;
  const parts: ReactNode[] = [];
  for (const role of props.hiddenRoles) {
    const n = cov.byRole[role];
    parts.push(
      <button key={role} type="button" className="link-button" onClick={() => props.onRole(role)}>
        {plural(n, ROLE_LABEL[role])} {roles.has(role) ? 'shown' : 'hidden'}
      </button>,
    );
  }
  if (cov.tooLarge > 0) {
    parts.push(
      <button
        key="large"
        type="button"
        className="link-button"
        aria-pressed={props.onlyTooLarge}
        onClick={props.onTooLarge}
      >
        {nf.format(cov.tooLarge)} over 500 KB (no imports)
      </button>,
    );
  }
  if (cov.skipped > 0) {
    parts.push(
      <button
        key="skipped"
        type="button"
        className="link-button"
        aria-expanded={props.showSkipped}
        aria-controls={props.skippedId}
        onClick={props.onSkipped}
      >
        {nf.format(cov.skipped)} vendored/generated skipped
      </button>,
    );
  }
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {p}
        </span>
      ))}
      .
    </>
  );
}

const rowKey = (row: InventoryRow) => (row.kind === 'folder' ? `d:${row.node.path}` : `f:${row.file.path}`);

function Row({ row, onToggle }: { row: InventoryRow; onToggle: (path: string) => void }) {
  const indent = { paddingLeft: `${row.depth * 16 + 8}px` };
  if (row.kind === 'folder') {
    return (
      <li className="inventory__row inventory__row--folder" style={indent}>
        <button
          type="button"
          className="inventory__folder"
          aria-expanded={!row.collapsed}
          onClick={() => onToggle(row.node.path)}
        >
          <span className="inventory__caret" aria-hidden="true">
            {row.collapsed ? '▸' : '▾'}
          </span>
          {row.node.name}/<span className="inventory__count">{nf.format(row.node.count)}</span>
        </button>
      </li>
    );
  }
  const { file } = row;
  const name = file.path.slice(file.path.lastIndexOf('/') + 1);
  return (
    <li className="inventory__row" style={indent} title={file.path}>
      <span className="inventory__name">{name}</span>
      {file.role !== 'source' && <span className={`tag tag--${file.role}`}>{file.role}</span>}
      {file.tooLarge && <span className="tag tag--large">too large</span>}
      <span className="inventory__size">{formatSize(file.size)}</span>
    </li>
  );
}
