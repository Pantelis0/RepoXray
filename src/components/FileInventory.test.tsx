// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { filterTree } from '../lib/filterTree';
import type { TreeEntry } from '../lib/github';
import { FileInventory } from './FileInventory';

const blob = (path: string, size = 100): TreeEntry => ({ path, type: 'blob', mode: '100644', size });

afterEach(cleanup);

const summary = filterTree([
  blob('src/index.ts'),
  blob('src/router/trie.ts'),
  blob('src/router/trie.test.ts'),
  blob('src/types.d.ts'),
  blob('src/big.js', 600 * 1024),
  blob('vendor/lib.js'),
  blob('dist/out.js'),
  blob('src/api.generated.ts'),
]);

const fileNames = () =>
  within(screen.getByRole('list', { name: 'Repository files' }))
    .queryAllByRole('listitem')
    .map((li) => li.textContent);

describe('FileInventory', () => {
  it('says exactly what is mapped and what is left out', () => {
    render(<FileInventory summary={summary} />);
    expect(screen.getByText(/Mapping/).textContent).toBe(
      'Mapping 3 of 5 JS/TS files: 1 test hidden, 1 type declaration hidden, 1 over 500 KB (no imports), 3 vendored/generated skipped.',
    );
  });

  it('shows folders with counts and production files only by default', () => {
    render(<FileInventory summary={summary} />);
    const rows = fileNames();
    expect(rows).toContain('▾src/3');
    expect(rows.some((r) => r?.startsWith('trie.ts'))).toBe(true);
    expect(rows.some((r) => r?.startsWith('trie.test.ts'))).toBe(false);
    expect(rows.some((r) => r?.includes('big.js') && r.includes('too large'))).toBe(true);
  });

  it('reveals tests from the coverage line and the toggle', async () => {
    const user = userEvent.setup();
    render(<FileInventory summary={summary} />);
    await user.click(screen.getByRole('button', { name: '1 test hidden' }));
    expect(fileNames().some((r) => r?.startsWith('trie.test.ts'))).toBe(true);
    expect(screen.getByText(/Mapping/).textContent).toMatch(/^Mapping 4 of 5/);
    expect((screen.getByRole('checkbox', { name: /tests \(1\)/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('lists skipped files on demand', async () => {
    const user = userEvent.setup();
    render(<FileInventory summary={summary} />);
    await user.click(screen.getByRole('button', { name: /vendored\/generated skipped/ }));
    expect(screen.getByText('vendor/lib.js')).toBeTruthy();
    expect(screen.getByText('src/api.generated.ts')).toBeTruthy();
  });

  it('collapses a folder and filters by path', async () => {
    const user = userEvent.setup();
    render(<FileInventory summary={summary} />);
    await user.click(screen.getByRole('button', { name: /router\// }));
    expect(fileNames().some((r) => r?.startsWith('trie.ts'))).toBe(false);
    await user.type(screen.getByLabelText('Filter files by path'), 'trie');
    expect(fileNames().some((r) => r?.startsWith('trie.ts'))).toBe(true);
    await user.clear(screen.getByLabelText('Filter files by path'));
    await user.type(screen.getByLabelText('Filter files by path'), 'nothing-matches');
    expect(screen.getByText('No files match.')).toBeTruthy();
  });

  it('caps the list at 500 rows and loads more on demand', async () => {
    const user = userEvent.setup();
    const big = filterTree(
      Array.from({ length: 1_200 }, (_, i) => blob(`f${String(i).padStart(4, '0')}.ts`)),
    );
    render(<FileInventory summary={big} />);
    expect(fileNames()).toHaveLength(500);
    expect(screen.getByText(/Showing 500 of 1,200 rows/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show 500 more' }));
    expect(fileNames()).toHaveLength(1_000);
    await user.click(screen.getByRole('button', { name: 'Show 200 more' }));
    expect(fileNames()).toHaveLength(1_200);
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('renders nothing when there are no JS/TS files', () => {
    const { container } = render(<FileInventory summary={filterTree([blob('README.md')])} />);
    expect(container.innerHTML).toBe('');
  });
});
