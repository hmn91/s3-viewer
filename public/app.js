// S3 Viewer — entry point: event bindings + init
// All logic delegated to modules/

import { state } from './modules/state.js';
import { apiFetchSources, apiGetFiles } from './modules/api.js';
import { renderFileList, renderStats, renderSourceDropdown, renderTagFilter } from './modules/render-ui.js';
import { openModal, closeModal, addSource } from './modules/sources-modal.js';
import { fetchAll } from './modules/fetch-all.js';
import { dbRowToFile } from './modules/parse.js';
import { openTagModal, closeTagModal } from './modules/tags-modal.js';
import { openTagPicker, closeAllTagPickers } from './modules/file-tag-ui.js';
import { apiGetTags } from './modules/api-tags.js';

// === EVENT BINDINGS ===

function bindEvents() {
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

  // Source dropdown: search input
  document.getElementById('source-search-input').addEventListener('input', e => {
    state.sourceSearch = e.target.value;
    renderSourceDropdown();
  });

  // Source dropdown: select/deselect all
  document.getElementById('btn-select-all-sources').addEventListener('click', () => {
    const q = state.sourceSearch.toLowerCase();
    const filtered = state.sources.filter(s => s.label.toLowerCase().includes(q));
    filtered.forEach(s => state.activeSourceIds.add(s.id));
    renderSourceDropdown();
    renderFileList();
    renderStats();
  });
  document.getElementById('btn-deselect-all-sources').addEventListener('click', () => {
    const q = state.sourceSearch.toLowerCase();
    const filtered = state.sources.filter(s => s.label.toLowerCase().includes(q));
    filtered.forEach(s => state.activeSourceIds.delete(s.id));
    renderSourceDropdown();
    renderFileList();
    renderStats();
  });

  // Tag filter dropdown: toggle panel
  document.getElementById('btn-tag-filter-dropdown').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('tag-filter-panel').classList.toggle('hidden');
    document.getElementById('source-dropdown-panel').classList.add('hidden');
  });

  // Global filename search
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

  // Column sort — event delegation on main-content (re-rendered on each update)
  document.getElementById('main-content').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    // Don't trigger sort if user clicked the filter input inside the header
    if (!th || e.target.closest('.col-filter-input')) return;
    const col = th.dataset.col;
    if (state.sortCol !== col) {
      state.sortCol = col;
      state.sortDir = 'asc';
    } else if (state.sortDir === 'asc') {
      state.sortDir = 'desc';
    } else {
      state.sortCol = null;
      state.sortDir = null;
    }
    renderFileList();
  });

  // Filename inline column filter — event delegation
  document.getElementById('main-content').addEventListener('input', e => {
    const input = e.target.closest('.col-filter-input');
    if (!input) return;
    state.filenameFilter = input.value;
    renderFileList();
    renderStats();
  });

  // Tag inline picker — event delegation on ＋ buttons in file rows
  document.getElementById('main-content').addEventListener('click', e => {
    const btn = e.target.closest('.btn-add-tag-inline');
    if (!btn) return;
    e.stopPropagation();
    openTagPicker(btn, btn.dataset.fileKey);
  });

  // Close dropdowns and pickers on outside click
  document.addEventListener('click', () => {
    document.getElementById('source-dropdown-panel').classList.add('hidden');
    document.getElementById('tag-filter-panel').classList.add('hidden');
    closeAllTagPickers();
  });

  // Close modals on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeTagModal();
    }
  });
}

// === INIT ===

async function init() {
  bindEvents();

  // Restore last fetch timestamp from localStorage
  const lastFetch = localStorage.getItem('lastFetch');
  if (lastFetch) document.getElementById('last-fetch-label').textContent = `Last fetch: ${lastFetch}`;

  // Load sources + persisted file data + tags in parallel
  try {
    const [sources, dbRows, tags] = await Promise.all([
      apiFetchSources(),
      apiGetFiles(),
      apiGetTags(),
    ]);

    state.sources = sources;
    state.activeSourceIds = new Set(sources.map(s => s.id));
    state.tags = tags;

    if (dbRows.length > 0) {
      state.allFiles = dbRows.map(dbRowToFile);
      renderFileList();
      renderStats();
    }

    renderSourceDropdown();
    renderTagFilter();
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

init();
