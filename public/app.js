// S3 Viewer — entry point: event bindings + init
// All logic delegated to modules/

import { state } from './modules/state.js';
import { apiFetchSources } from './modules/api.js';
import { renderFileList, renderStats, renderSourceFilter } from './modules/render-ui.js';
import { openModal, closeModal, addSource } from './modules/sources-modal.js';
import { fetchAll } from './modules/fetch-all.js';

// === EVENTS ===

function bindEvents() {
  document.getElementById('btn-manage-sources').addEventListener('click', openModal);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('btn-add-source').addEventListener('click', addSource);
  document.getElementById('input-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') addSource();
  });
  document.getElementById('btn-fetch-all').addEventListener('click', fetchAll);
  document.getElementById('select-sort').addEventListener('change', e => {
    state.sortBy = e.target.value;
    renderFileList();
  });
  document.querySelectorAll('input[name="view-mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      state.viewMode = e.target.value;
      renderSourceFilter();
      renderFileList();
      renderStats();
    });
  });
  // Close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// === INIT ===

async function init() {
  bindEvents();

  // Restore last fetch timestamp from localStorage
  const lastFetch = localStorage.getItem('lastFetch');
  if (lastFetch) document.getElementById('last-fetch-label').textContent = `Last fetch: ${lastFetch}`;

  // Load sources on startup
  try {
    state.sources = await apiFetchSources();
    state.activeSourceIds = new Set(state.sources.map(s => s.id));
    renderSourceFilter();
  } catch (err) {
    console.error('Failed to load sources:', err);
  }
}

init();
