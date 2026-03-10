// Centralized app state — single source of truth

export const state = {
  sources: [],       // [{ id, label, url }]
  allFiles: [],      // parsed file objects with isNew flag
  seenMap: {},       // { key: { firstSeen, ... } } from /api/seen
  sortBy: 'newest',
  viewMode: 'all',
  activeSourceIds: new Set(), // source IDs visible in filter
  fetchErrors: {},   // { sourceUrl: errorMessage }
};

export function getVisibleFiles() {
  if (state.viewMode === 'by-source') return state.allFiles;
  if (state.activeSourceIds.size === 0) return state.allFiles;
  return state.allFiles.filter(f => state.activeSourceIds.has(f.sourceId));
}
