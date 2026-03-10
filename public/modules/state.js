// Centralized app state — single source of truth

export const state = {
  sources: [],         // [{ id, label, url }]
  allFiles: [],        // parsed file objects
  seenMap: {},         // { key: { firstSeen, ... } } from /api/seen
  sortCol: null,       // column key or null (null = default: newest lastModified)
  sortDir: null,       // 'asc' | 'desc' | null
  viewMode: 'all',
  activeSourceIds: new Set(), // source IDs visible in filter
  fetchErrors: {},
  searchQuery: '',     // global filename search
  filenameFilter: '',  // inline column filter
  sourceSearch: '',    // source dropdown search input
  tags: [],            // [{ id, name, color }] — all available tags
  activeTagIds: new Set(), // tag IDs selected in tag filter
};

export function getVisibleFiles() {
  let files = state.allFiles;

  // Source filter (applies in all view modes since dropdown is always visible)
  if (state.activeSourceIds.size > 0 && state.activeSourceIds.size < state.sources.length) {
    files = files.filter(f => state.activeSourceIds.has(f.sourceId));
  }

  // Global search (case-insensitive substring on displayName)
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    files = files.filter(f => f.displayName.toLowerCase().includes(q));
  }

  // Filename column filter (additive AND with global search)
  if (state.filenameFilter) {
    const q = state.filenameFilter.toLowerCase();
    files = files.filter(f => f.displayName.toLowerCase().includes(q));
  }

  // Tag filter — OR logic: show files that have ANY of the selected tags
  if (state.activeTagIds.size > 0) {
    files = files.filter(f => f.tags && f.tags.some(t => state.activeTagIds.has(t.id)));
  }

  return files;
}
