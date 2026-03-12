// Global cross-project search UI — debounced input, grouped results display

import { apiSearch } from './project-api.js';
import { escHtml, formatDate } from './utils.js';

let debounceTimer = null;

/**
 * Bind project-level search input + type selector.
 * @param {Function} onProjectSelect - called with project object when a result is clicked
 */
export function bindProjectSearch(onProjectSelect) {
  const input = document.getElementById('project-search');
  const typeSelect = document.getElementById('project-search-type');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      clearSearchResults();
      return;
    }
    debounceTimer = setTimeout(() => runSearch(q, typeSelect.value, onProjectSelect), 300);
  });

  // Re-run when type changes (if query already entered)
  typeSelect.addEventListener('change', () => {
    const q = input.value.trim();
    if (q.length >= 2) runSearch(q, typeSelect.value, onProjectSelect);
  });
}

async function runSearch(q, type, onProjectSelect) {
  try {
    const results = await apiSearch(q, type);
    renderSearchResults(results, onProjectSelect);
  } catch (err) {
    console.error('Search error:', err);
  }
}

/** Hide results and show normal project list */
export function clearSearchResults() {
  document.getElementById('search-results-container').classList.add('hidden');
  document.getElementById('project-list-container').classList.remove('hidden');
}

function renderSearchResults(results, onProjectSelect) {
  const container = document.getElementById('search-results-container');
  const listContainer = document.getElementById('project-list-container');

  const total = results.projects.length + results.files.length +
                results.sources.length + results.tags.length;

  if (total === 0) {
    container.innerHTML = '<div class="empty-state">No results found.</div>';
    listContainer.classList.add('hidden');
    container.classList.remove('hidden');
    return;
  }

  let html = '';

  if (results.projects.length > 0) {
    html += `<div class="search-section-label">Projects (${results.projects.length})</div>`;
    html += results.projects.map(p => `
      <div class="search-result-row" data-project-id="${p.id}">
        <div class="search-result-main">${escHtml(p.name)}</div>
        <div class="search-result-meta muted-text">${p.source_count} source${p.source_count !== 1 ? 's' : ''} · ${p.file_count} file${p.file_count !== 1 ? 's' : ''}</div>
      </div>
    `).join('');
  }

  if (results.sources.length > 0) {
    html += `<div class="search-section-label">Sources (${results.sources.length})</div>`;
    html += results.sources.map(s => `
      <div class="search-result-row" data-project-id="${s.project_id}">
        <div class="search-result-main">${escHtml(s.label)}</div>
        <div class="search-result-meta muted-text mono">${escHtml(s.url)}</div>
        <div class="search-result-badge">in: ${escHtml(s.project_name)}</div>
      </div>
    `).join('');
  }

  if (results.tags.length > 0) {
    html += `<div class="search-section-label">Tags (${results.tags.length})</div>`;
    html += results.tags.map(t => `
      <div class="search-result-row" data-project-id="${t.project_id}">
        <div class="search-result-main">
          <span class="badge-tag" style="background:${escHtml(t.color)}">${escHtml(t.name)}</span>
        </div>
        <div class="search-result-badge">in: ${escHtml(t.project_name)}</div>
      </div>
    `).join('');
  }

  if (results.files.length > 0) {
    html += `<div class="search-section-label">Files (${results.files.length})</div>`;
    html += results.files.map(f => {
      // Extract just the filename portion from the composite key (sourceUrl::s3Key)
      const parts = f.key.split('::');
      const s3Key = parts.length > 1 ? parts.slice(1).join('::') : f.key;
      const filename = s3Key.split('/').pop() || s3Key;
      const date = f.last_modified ? formatDate(new Date(f.last_modified)) : '';
      return `
        <div class="search-result-row" data-project-id="${f.project_id}">
          <div class="search-result-main mono">${escHtml(filename)}</div>
          <div class="search-result-meta muted-text">${escHtml(s3Key)}</div>
          <div class="search-result-badge">in: ${escHtml(f.project_name)} · ${escHtml(f.source_label)}${date ? ' · ' + date : ''}</div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = html;
  listContainer.classList.add('hidden');
  container.classList.remove('hidden');

  // Bind clicks — navigate to that project
  container.querySelectorAll('.search-result-row[data-project-id]').forEach(row => {
    row.addEventListener('click', () => {
      const projectId = Number(row.dataset.projectId);
      onProjectSelect(projectId);
    });
  });
}
