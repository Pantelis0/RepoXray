// Distinct colours that read well on the dark canvas.
const PALETTE = [
  '#5EEAD4', // teal
  '#F2B36B', // amber
  '#A5B4FC', // indigo
  '#F9A8D4', // pink
  '#86EFAC', // green
  '#FCA5A5', // red
  '#93C5FD', // blue
  '#FDE68A', // yellow
];

const ROOT_COLOR = '#A9B5C2';

/** Assigns each top-level folder a stable colour, in alphabetical order. */
export function folderColors(folders: string[]): Record<string, string> {
  const unique = [...new Set(folders)].sort();
  const colors: Record<string, string> = {};
  let i = 0;
  for (const folder of unique) {
    colors[folder] = folder === '' ? ROOT_COLOR : PALETTE[i++ % PALETTE.length];
  }
  return colors;
}
