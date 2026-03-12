// File sorting and filtering utilities

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Returns true if file was first seen within the last 24 hours
export function isNewFile(firstSeen) {
  if (!firstSeen) return false;
  return (Date.now() - new Date(firstSeen).getTime()) < ONE_DAY_MS;
}

// Sort comparators keyed by column
const COMPARATORS = {
  displayName: (a, b) => a.displayName.localeCompare(b.displayName),
  folder:      (a, b) => a.folder.localeCompare(b.folder),
  sourceLabel: (a, b) => a.sourceLabel.localeCompare(b.sourceLabel),
  size:        (a, b) => a.size - b.size,
  lastModified:(a, b) => (a.lastModified || 0) - (b.lastModified || 0),
  firstSeen:   (a, b) => new Date(a.firstSeen || 0) - new Date(b.firstSeen || 0),
  comment:     (a, b) => (a.comment || '').localeCompare(b.comment || ''),
};

// Sort files by column + direction; null col = default (newest lastModified first)
export function sortFiles(files, col, dir) {
  const sorted = [...files];
  if (!col || !dir) {
    // Default: newest lastModified first
    sorted.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
    return sorted;
  }
  const cmp = COMPARATORS[col];
  if (!cmp) return sorted;
  sorted.sort((a, b) => dir === 'asc' ? cmp(a, b) : cmp(b, a));
  return sorted;
}
