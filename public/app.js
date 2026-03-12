// S3 Viewer — entry point: project routing + event bindings + init
// All logic delegated to modules/

import { state } from './modules/state.js';
import { apiFetchSources, apiGetFiles, apiGetHiddenKeys, apiHideFile, apiUnhideFile, apiUpdateComment } from './modules/api.js';
import { apiGetTags } from './modules/api-tags.js';
import { apiGetProjects } from './modules/project-api.js';
import { renderFileList, renderStats, renderSourceDropdown, renderTagFilter } from './modules/render-ui.js';
import { openModal, closeModal, addSource } from './modules/sources-modal.js';
import { fetchAll } from './modules/fetch-all.js';
import { dbRowToFile } from './modules/parse.js';
import { openTagModal, closeTagModal } from './modules/tags-modal.js';
import { openTagPicker, closeAllTagPickers } from './modules/file-tag-ui.js';
import { updateFileRowHidden } from './modules/render-table.js';
import {
  showProjectListView, showProjectDetailView,
  renderProjectList, bindNewProjectButton, setProjectSelectHandler,
} from './modules/project-list-view.js';
import { bindProjectSearch, clearSearchResults } from './modules/project-search-ui.js';

// =====================================================================
// PROJECT NAVIGATION
// =====================================================================

/** Reset file-viewer state and load data for the given project */
async function enterProject(project) {
  state.currentProject = project;

  // Reset all file-viewer state
  state.sources = [];
  state.allFiles = [];
  state.tags = [];
  state.seenMap = {};
  state.activeSourceIds = new Set();
  state.activeTagIds = new Set();
  state.filterNoTag = false;
  state.searchQuery = '';
  state.sourceSearch = '';
  state.tagSearch = '';
  state.filterNew = false;
  state.sortCol = null;
  state.sortDir = null;
  state.fetchErrors = {};
  state.hiddenKeys = new Set();
  state.showHidden = false;

  // Reset UI controls to match cleared state
  const searchInput = document.getElementById('global-search');
  if (searchInput) searchInput.value = '';

  showProjectDetailView(project);

  // Update --header-h for sticky subheader inside project detail
  const headerEl = document.querySelector('#view-project-detail .header');
  if (headerEl) {
    document.documentElement.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
  }

  // Restore per-project last-fetch timestamp
  const lsKey = `lastFetch_${project.id}`;
  const lastFetch = localStorage.getItem(lsKey);
  document.getElementById('last-fetch-label').textContent =
    lastFetch ? `Last fetch: ${lastFetch}` : 'Not fetched yet';

  // Load project-scoped data
  try {
    const [sources, dbRows, tags, hiddenKeys] = await Promise.all([
      apiFetchSources(project.id),
      apiGetFiles(project.id),
      apiGetTags(project.id),
      apiGetHiddenKeys(project.id),
    ]);

    state.sources = sources;
    state.activeSourceIds = new Set(sources.map(s => s.id));
    state.tags = tags;
    // Init tag filter: all selected (= show all), matches visible state so dropdown isn't misleading
    state.activeTagIds = new Set(tags.map(t => t.id));
    state.filterNoTag = true;
    state.hiddenKeys = new Set(hiddenKeys);

    if (dbRows.length > 0) {
      state.allFiles = dbRows.map(dbRowToFile);
      state.allFiles.forEach(f => { f.isHidden = state.hiddenKeys.has(f.key); });
      updateHiddenButton();
      renderFileList();
      renderStats();
    } else {
      document.getElementById('main-content').innerHTML =
        '<div class="empty-state">Add sources via ⚙ Manage Sources, then click ⬇ Fetch All.</div>';
      document.getElementById('stats-bar').classList.add('hidden');
    }

    renderSourceDropdown();
    renderTagFilter();
  } catch (err) {
    console.error('Failed to load project data:', err);
  }
}

/** Return to the project list, refreshing counts */
async function exitProject() {
  state.currentProject = null;
  clearSearchResults();
  showProjectListView();
  try {
    const projects = await apiGetProjects();
    renderProjectList(projects);
  } catch (err) {
    console.error('Failed to reload projects:', err);
  }
}

// =====================================================================
// HIDDEN FILE HELPERS
// =====================================================================

/** Scroll to file row by key and flash-highlight it for 2s */
function highlightFileRow(fileKey) {
  // Use requestAnimationFrame to ensure the DOM has rendered first
  requestAnimationFrame(() => {
    const row = document.querySelector(`tr[data-file-key="${CSS.escape(fileKey)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('file-row-highlight');
    setTimeout(() => row.classList.remove('file-row-highlight'), 2000);
  });
}

function updateHiddenButton() {
  const count = state.hiddenKeys.size;
  const btn = document.getElementById('btn-show-hidden');
  document.getElementById('hidden-count').textContent = count;
  btn.classList.toggle('hidden', count === 0);
  btn.classList.toggle('btn-filter-new-active', state.showHidden);
}

// =====================================================================
// FILE VIEWER EVENT BINDINGS (bound once, work inside #view-project-detail)
// =====================================================================

function bindFileViewerEvents() {
  // Back to projects
  document.getElementById('btn-back-to-projects').addEventListener('click', exitProject);

  // Sources modal
  document.getElementById('btn-manage-sources').addEventListener('click', openModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('btn-add-source').addEventListener('click', addSource);
  document.getElementById('input-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSource();
  });

  // Fetch all
  document.getElementById('btn-fetch-all').addEventListener('click', fetchAll);

  // View mode radio buttons
  document.querySelectorAll('input[name="view-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      state.viewMode = e.target.value;
      renderFileList();
      renderStats();
    });
  });

  // Source dropdown: toggle panel
  document.getElementById('btn-source-dropdown').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('source-dropdown-panel').classList.toggle('hidden');
    document.getElementById('tag-filter-panel').classList.add('hidden');
  });
  document.getElementById('source-dropdown-panel').addEventListener('click', e => e.stopPropagation());

  // Source dropdown: search + select/deselect all + apply
  document.getElementById('source-search-input').addEventListener('input', e => {
    state.sourceSearch = e.target.value;
    renderSourceDropdown();
  });
  document.getElementById('btn-select-all-sources').addEventListener('click', () => {
    const q = state.sourceSearch.toLowerCase();
    state.sources.filter(s => s.label.toLowerCase().includes(q)).forEach(s => state.activeSourceIds.add(s.id));
    renderSourceDropdown();
  });
  document.getElementById('btn-deselect-all-sources').addEventListener('click', () => {
    const q = state.sourceSearch.toLowerCase();
    state.sources.filter(s => s.label.toLowerCase().includes(q)).forEach(s => state.activeSourceIds.delete(s.id));
    renderSourceDropdown();
  });
  document.getElementById('btn-apply-source-filter').addEventListener('click', () => {
    document.getElementById('source-dropdown-panel').classList.add('hidden');
    renderFileList();
    renderStats();
  });

  // Tag filter dropdown: toggle + search + select/deselect all + apply
  document.getElementById('btn-tag-filter-dropdown').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('tag-filter-panel').classList.toggle('hidden');
    document.getElementById('source-dropdown-panel').classList.add('hidden');
  });
  document.getElementById('tag-filter-panel').addEventListener('click', e => e.stopPropagation());
  document.getElementById('tag-search-input').addEventListener('input', e => {
    state.tagSearch = e.target.value;
    renderTagFilter();
  });
  document.getElementById('btn-select-all-tags').addEventListener('click', () => {
    const q = state.tagSearch.toLowerCase();
    state.tags.filter(t => t.name.toLowerCase().includes(q)).forEach(t => state.activeTagIds.add(t.id));
    if (!q) state.filterNoTag = true; // select all also includes "No Tag" when not searching
    renderTagFilter();
  });
  document.getElementById('btn-deselect-all-tags').addEventListener('click', () => {
    const q = state.tagSearch.toLowerCase();
    state.tags.filter(t => t.name.toLowerCase().includes(q)).forEach(t => state.activeTagIds.delete(t.id));
    if (!q) state.filterNoTag = false; // deselect all also clears "No Tag" when not searching
    renderTagFilter();
  });
  document.getElementById('btn-apply-tag-filter').addEventListener('click', () => {
    // Guard: do nothing if nothing selected (button should be disabled, but double-check)
    if (state.activeTagIds.size === 0 && !state.filterNoTag) return;
    document.getElementById('tag-filter-panel').classList.add('hidden');
    renderFileList();
    renderStats();
  });

  // Global filename search (project-scoped — state.allFiles already project-filtered)
  document.getElementById('global-search').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderFileList();
    renderStats();
  });

  // Tag manager modal
  document.getElementById('btn-manage-tags').addEventListener('click', openTagModal);
  document.getElementById('btn-close-tag-modal').addEventListener('click', closeTagModal);
  document.getElementById('tag-modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('tag-modal-overlay')) closeTagModal();
  });

  // Column sort — event delegation
  document.getElementById('main-content').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const col = th.dataset.col;
    if (state.sortCol !== col) {
      state.sortCol = col; state.sortDir = 'asc';
    } else if (state.sortDir === 'asc') {
      state.sortDir = 'desc';
    } else {
      state.sortCol = null; state.sortDir = null;
    }
    renderFileList();
  });

  // Tag inline picker — event delegation
  document.getElementById('main-content').addEventListener('click', e => {
    const btn = e.target.closest('.btn-add-tag-inline');
    if (!btn) return;
    e.stopPropagation();
    openTagPicker(btn, btn.dataset.fileKey);
  });

  // Hide file — event delegation
  document.getElementById('main-content').addEventListener('click', async e => {
    const hideBtn = e.target.closest('.btn-hide-file');
    if (hideBtn) {
      e.stopPropagation();
      const fileKey = hideBtn.dataset.fileKey;
      try {
        await apiHideFile(fileKey, state.currentProject?.id);
        state.hiddenKeys.add(fileKey);
        const file = state.allFiles.find(f => f.key === fileKey);
        if (file) { file.isHidden = true; updateFileRowHidden(file); }
        updateHiddenButton();
      } catch (err) { console.error('Hide failed:', err); }
      return;
    }
    const unhideBtn = e.target.closest('.btn-unhide-file');
    if (unhideBtn) {
      e.stopPropagation();
      const fileKey = unhideBtn.dataset.fileKey;
      try {
        await apiUnhideFile(fileKey, state.currentProject?.id);
        state.hiddenKeys.delete(fileKey);
        const file = state.allFiles.find(f => f.key === fileKey);
        if (file) { file.isHidden = false; updateFileRowHidden(file); }
        updateHiddenButton();
      } catch (err) { console.error('Unhide failed:', err); }
      return;
    }
  });

  // Show hidden toggle
  document.getElementById('btn-show-hidden').addEventListener('click', () => {
    state.showHidden = !state.showHidden;
    updateHiddenButton();
    renderFileList();
    renderStats();
  });

  // Comment inline edit — click span to edit, blur/Enter to save
  document.getElementById('main-content').addEventListener('click', e => {
    const span = e.target.closest('.file-comment');
    if (!span || span.querySelector('input')) return; // already editing
    const fileKey = span.dataset.fileKey;
    const current = span.textContent;
    const input = document.createElement('input');
    input.className = 'comment-input';
    input.value = current;
    input.placeholder = 'Add comment…';
    span.textContent = '';
    span.appendChild(input);
    input.focus();
    input.select();

    const save = async () => {
      const newVal = input.value.trim();
      span.textContent = newVal;
      const file = state.allFiles.find(f => f.key === fileKey);
      if (file && file.comment !== newVal) {
        file.comment = newVal;
        try { await apiUpdateComment(fileKey, newVal, state.currentProject?.id); }
        catch (err) { console.error('Comment save failed:', err); }
      }
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = current; input.blur(); }
    });
  });

  // Close dropdowns/pickers on outside click
  document.addEventListener('click', () => {
    document.getElementById('source-dropdown-panel').classList.add('hidden');
    document.getElementById('tag-filter-panel').classList.add('hidden');
    closeAllTagPickers();
  });

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeTagModal(); }
  });
}

// =====================================================================
// INIT
// =====================================================================

async function init() {
  // Wire file viewer events (always bound, just hidden until project selected)
  bindFileViewerEvents();

  // Wire project list: project selection handler + search
  setProjectSelectHandler(enterProject);

  bindNewProjectButton(async (newProject) => {
    // After creation, refresh list and enter immediately
    const projects = await apiGetProjects();
    renderProjectList(projects);
    enterProject(newProject);
  });

  // Handle search result clicks that pass a projectId + optional fileKey
  bindProjectSearch(async (projectId, fileKey) => {
    try {
      const projects = await apiGetProjects();
      const project = projects.find(p => p.id === projectId);
      if (!project) return;
      await enterProject(project);
      if (fileKey) highlightFileRow(fileKey);
    } catch (err) {
      console.error('Failed to enter project from search:', err);
    }
  });

  // Load and render project list
  try {
    const projects = await apiGetProjects();
    renderProjectList(projects);
  } catch (err) {
    console.error('Failed to load projects:', err);
    document.getElementById('project-list-container').innerHTML =
      '<div class="empty-state">Failed to load projects.</div>';
  }

  showProjectListView();
}

init();
