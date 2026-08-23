// Centralized app state — single source of truth

export const state = {
  currentProject: null, // { id, name, created_at, last_fetch_at } — null = project list screen
  sources: [],         // [{ id, label, url, project_id }]
  allFiles: [],        // parsed file objects for the current API page only
  filePage: 1,
  filePageSize: 50,
  fileTotal: 0,        // number of files matching the current server-side filters
  fileTotalPages: 0,
  projectFileTotal: 0, // all project files, regardless of filters/hidden state
  hiddenCount: 0,
  newCount: 0,
  sortCol: null,       // column key or null (null = default: newest lastModified)
  sortDir: null,       // 'asc' | 'desc' | null
  viewMode: 'all',
  activeSourceIds: new Set(), // source IDs visible in filter; empty = show nothing
  fetchErrors: {},
  searchQuery: '',     // global filename search
  negativeSearch: false, // if true, exclude files matching the global search
  sourceSearch: '',    // source dropdown search input
  tagSearch: '',       // tag filter dropdown search input
  tags: [],            // [{ id, name, color }] — all available tags
  blacklistRules: [],  // [{ id, rule_type, value, project_id }]
  activeTagIds: new Set(), // tag IDs selected in tag filter
  filterNoTag: false,  // if true, include files with no tags in tag filter results
  filterNew: false,    // if true, show only NEW files
  showHidden: false,   // if true, request hidden files together with visible files
};

export function getVisibleFiles() {
  // Search, source, tag, NEW, and hidden filters are applied by /api/files before
  // this page reaches the browser.
  return state.allFiles;
}
