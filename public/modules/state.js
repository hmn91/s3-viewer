// Centralized app state — single source of truth

export const state = {
  currentProject: null, // { id, name, created_at, last_fetch_at } — null = project list screen
  sources: [],         // [{ id, label, url, project_id }]
  allFiles: [],        // parsed file objects
  seenMap: {},         // { key: { firstSeen, ... } } from /api/seen
  sortCol: null,       // column key or null (null = default: newest lastModified)
  sortDir: null,       // 'asc' | 'desc' | null
  viewMode: 'all',
  activeSourceIds: new Set(), // source IDs visible in filter; empty = show nothing
  fetchErrors: {},
  searchQuery: '',     // global filename search
  sourceSearch: '',    // source dropdown search input
  tagSearch: '',       // tag filter dropdown search input
  tags: [],            // [{ id, name, color }] — all available tags
  activeTagIds: new Set(), // tag IDs selected in tag filter
  filterNoTag: false,  // if true, include files with no tags in tag filter results
  filterNew: false,    // if true, show only NEW files
  hiddenKeys: new Set(), // file keys that are hidden
  showHidden: false,     // if true, show hidden files (grayed out) with unhide button
};

export function getVisibleFiles() {
  let files = state.allFiles;

  // Source filter: empty set = show nothing (not "show all")
  if (state.activeSourceIds.size === 0) return [];
  if (state.activeSourceIds.size < state.sources.length) {
    files = files.filter(f => state.activeSourceIds.has(f.sourceId));
  }

  // Global search: filename, comment, tags (by name), url
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    files = files.filter(f =>
      f.displayName.toLowerCase().includes(q) ||
      (f.comment && f.comment.toLowerCase().includes(q)) ||
      (f.tags && f.tags.some(t => t.name.toLowerCase().includes(q))) ||
      f.url.toLowerCase().includes(q)
    );
  }

  // Tag filter — OR logic across tags + "no tag" option
  // Skip filter entirely when all options are selected (= show all, no filtering needed)
  const allTagsSelected = state.filterNoTag && state.activeTagIds.size === state.tags.length;
  if (!allTagsSelected && (state.activeTagIds.size > 0 || state.filterNoTag)) {
    files = files.filter(f => {
      const hasNoTags = !f.tags || f.tags.length === 0;
      if (state.filterNoTag && hasNoTags) return true;
      if (state.activeTagIds.size > 0 && f.tags && f.tags.some(t => state.activeTagIds.has(t.id))) return true;
      return false;
    });
  }

  // NEW filter
  if (state.filterNew) {
    files = files.filter(f => f.isNew);
  }

  // Hidden files filter: exclude hidden unless showHidden is on
  if (!state.showHidden && state.hiddenKeys.size > 0) {
    files = files.filter(f => !state.hiddenKeys.has(f.key));
  }

  return files;
}
