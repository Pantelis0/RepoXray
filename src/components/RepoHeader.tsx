import type { TreeSummary } from '../lib/filterTree';
import type { RepoMeta } from '../lib/github';
import type { RepoRef } from '../lib/parseRepoUrl';

export interface RepoHeaderProps {
  meta: RepoMeta;
  branch: string;
  /** What the user typed, to detect renames and transfers. */
  requested: RepoRef;
  summary?: TreeSummary;
  /** Shown inside the header when the repo was found but can't be analysed. */
  problem?: string;
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

export function RepoHeader({ meta, branch, requested, summary, problem }: RepoHeaderProps) {
  const fullName = `${meta.owner}/${meta.repo}`;
  const typed = `${requested.owner}/${requested.repo}`;
  const moved = typed.toLowerCase() !== fullName.toLowerCase();

  return (
    <article
      className={`repo-header${problem ? ' repo-header--problem' : ''}`}
      aria-label={`Repository ${fullName}`}
    >
      <div className="repo-header__top">
        <h2 className="repo-header__title">
          <a href={meta.htmlUrl} target="_blank" rel="noopener noreferrer">
            {fullName}
          </a>
        </h2>
        <ul className="repo-header__facts" aria-label="Repository details">
          <li title={`${full.format(meta.stars)} stars`}>
            <span aria-hidden="true">★ </span>
            {compact.format(meta.stars)}
            <span className="visually-hidden"> stars</span>
          </li>
          {meta.language && <li>{meta.language}</li>}
          {meta.archived && <li className="badge badge--warn">Archived</li>}
          {meta.fork && <li className="badge">Fork</li>}
        </ul>
      </div>

      {meta.description && <p className="repo-header__desc">{meta.description}</p>}

      <p className="repo-header__stats">
        Branch <code>{branch}</code>
        {summary && (
          <>
            {' · '}
            {full.format(summary.totalFiles)} files{' · '}
            <strong>{full.format(summary.sourceFiles.length)} JS/TS files</strong>
          </>
        )}
      </p>

      {moved && (
        <p className="repo-header__moved">
          <span aria-hidden="true">↪ </span>You typed <code>{typed}</code>. GitHub says it now lives at{' '}
          <code>{fullName}</code>.
        </p>
      )}

      {!problem && summary && summary.tooLargeCount > 0 && (
        <p className="repo-header__incomplete" role="status">
          <strong>Analysis incomplete:</strong> {full.format(summary.tooLargeCount)}{' '}
          {summary.tooLargeCount === 1 ? 'file is' : 'files are'} over 500 KB, so{' '}
          {summary.tooLargeCount === 1 ? 'it' : 'they'} will show without imports.
        </p>
      )}

      {problem ? (
        <p className="repo-header__problem" role="alert">
          {problem}
        </p>
      ) : (
        summary && (
          <p className="repo-header__next">
            {summary.sourceFiles.length === 0
              ? 'No JS/TS files to map in this repo.'
              : 'File list ready. Import analysis is next, so the graph below is still sample data.'}
          </p>
        )
      )}
    </article>
  );
}
