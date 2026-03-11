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

  // Prevent clicks inside source panel from closing it (fixes filter input + Select All)
  document.getElementById('source-dropdown-panel').addEventListener('click', e => e.stopPropagation());

  // Source dropdown: search input
  document.getElementById('source-search-input').addEventListener('input', e => {
    state.sourceSearch = e.target.value;
    renderSourceDropdown();
  });

  // Source dropdown: select/deselect all
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

  // Source dropdown: Apply button applies filter + closes panel
  document.getElementById('btn-apply-source-filter').addEventListener('click', () => {
    document.getElementById('source-dropdown-panel').classList.add('hidden');
    renderFileList();
    renderStats();
  });

  // Tag filter dropdown: toggle panel
  document.getElementById('btn-tag-filter-dropdown').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('tag-filter-panel').classList.toggle('hidden');
    document.getElementById('source-dropdown-panel').classList.add('hidden');
  });

  // Prevent clicks inside tag filter panel from closing it
  document.getElementById('tag-filter-panel').addEventListener('click', e => e.stopPropagation());

  // Tag filter: search input
  document.getElementById('tag-search-input').addEventListener('input', e => {
    state.tagSearch = e.target.value;
    renderTagFilter();
  });

  // Tag filter: select/deselect all (filtered)
  document.getElementById('btn-select-all-tags').addEventListener('click', () => {
    const q = state.tagSearch.toLowerCase();
    state.tags.filter(t => t.name.toLowerCase().includes(q)).forEach(t => state.activeTagIds.add(t.id));
    renderTagFilter();
  });
  document.getElementById('btn-deselect-all-tags').addEventListener('click', () => {
    const q = state.tagSearch.toLowerCase();
    state.tags.filter(t => t.name.toLowerCase().includes(q)).forEach(t => state.activeTagIds.delete(t.id));
    renderTagFilter();
  });

  // Tag filter: Apply button applies filter + closes panel
  document.getElementById('btn-apply-tag-filter').addEventListener('click', () => {
    document.getElementById('tag-filter-panel').classList.add('hidden');
    renderFileList();
    renderStats();
  });

  // Global filename search
  document.getElementById('global-search').addEventListener('input', e => {
    state.searchQuery = e.target.value;
    renderFileList();
    renderStats();
  });

  // NEW-only filter toggle
  document.getElementById('btn-filter-new').addEventListener('click', () => {
    state.filterNew = !state.filterNew;
    const btn = document.getElementById('btn-filter-new');
    btn.classList.toggle('btn-filter-new-active', state.filterNew);
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
    if (!th) return;
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

  // Set --header-h CSS variable so sticky-subheader positions exactly below header
  const headerEl = document.querySelector('.header');
  if (headerEl) {
    document.documentElement.style.setProperty('--header-h', headerEl.offsetHeight + 'px');
  }

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
