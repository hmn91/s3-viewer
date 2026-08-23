// Server-side file pagination and filter synchronization.

import { state } from './state.js';
import { apiGetFiles } from './api.js';
import { dbRowToFile } from './parse.js';
import { renderFileList, renderStats } from './render-ui.js';
import { updateHiddenButton } from './hidden-ui.js';

let activeController = null;

function selectedIdsOrAll(selectedIds, allItems) {
  if (allItems.length > 0 && selectedIds.size === allItems.length) return null;
  return [...selectedIds];
}

function currentFileQuery(page) {
  const allTagsSelected = state.filterNoTag && state.activeTagIds.size === state.tags.length;
  return {
    page,
    limit: state.filePageSize,
    showHidden: state.showHidden,
    sourceIds: selectedIdsOrAll(state.activeSourceIds, state.sources),
    tagIds: allTagsSelected ? null : [...state.activeTagIds],
    includeNoTag: allTagsSelected ? false : state.filterNoTag,
    search: state.searchQuery,
    negativeSearch: state.negativeSearch,
    newOnly: state.filterNew,
    sortCol: state.sortCol,
    sortDir: state.sortDir,
  };
}

export function renderFilePagination(loading = false) {
  const container = document.getElementById('file-pagination');
  const pageSize = document.getElementById('file-page-size');
  const previous = document.getElementById('btn-file-page-prev');
  const next = document.getElementById('btn-file-page-next');
  const summary = document.getElementById('file-page-summary');

  pageSize.value = String(state.filePageSize);
  const hasFiles = state.projectFileTotal > 0;
  container.classList.toggle('hidden', !hasFiles);

  const displayedPages = Math.max(state.fileTotalPages, 1);
  summary.textContent = `Page ${state.filePage} of ${displayedPages}`;
  previous.disabled = loading || state.filePage <= 1;
  next.disabled = loading || state.fileTotalPages === 0 || state.filePage >= state.fileTotalPages;
  pageSize.disabled = loading;
}

export async function loadFilePage(page = state.filePage) {
  const projectId = state.currentProject?.id;
  if (!projectId) return;

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  renderFilePagination(true);

  try {
    const result = await apiGetFiles(projectId, currentFileQuery(page), controller.signal);
    if (controller.signal.aborted || state.currentProject?.id !== projectId) return;

    state.allFiles = result.items.map(dbRowToFile);
    state.filePage = result.pagination.page;
    state.filePageSize = result.pagination.limit;
    state.fileTotal = result.pagination.total_items;
    state.fileTotalPages = result.pagination.total_pages;
    state.projectFileTotal = result.project_total_items;
    state.hiddenCount = result.hidden_count;
    state.newCount = result.new_count;
    if (state.hiddenCount === 0) state.showHidden = false;

    renderFileList();
    renderStats();
    updateHiddenButton();
    renderFilePagination();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Failed to load file page:', err);
    document.getElementById('main-content').innerHTML =
      '<div class="empty-state">Failed to load files.</div>';
  } finally {
    if (activeController === controller) {
      activeController = null;
      renderFilePagination();
    }
  }
}
