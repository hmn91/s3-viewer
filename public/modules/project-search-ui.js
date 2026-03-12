// Global cross-project search UI — debounced input, grouped results display

import { apiSearch } from './project-api.js';
import { escHtml, formatDate } from './utils.js';

let debounceTimer = null;

/**
 * Bind project-level search input + type selector + include-hidden checkbox.
 * @param {Function} onProjectSelect - called with (projectId, fileKey|null) when a result is clicked
 */
export function bindProjectSearch(onProjectSelect) {
  const input = document.getElementById('project-search');
  const typeSelect = document.getElementById('project-search-type');
  const hiddenCheck = document.getElementById('project-search-include-hidden');

  const trigger = () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) { clearSearchResults(); return; }
    debounceTimer = setTimeout(() => runSearch(q, typeSelect.value, hiddenCheck.checked, onProjectSelect), 300);
  };

  input.addEventListener('input', trigger);
  typeSelect.addEventListener('change', trigger);
  hiddenCheck.addEventListener('change', trigger);
}

async function runSearch(q, type, includeHidden, onProjectSelect) {
  try {
    const results = await apiSearch(q, type, includeHidden);
    renderSearchResults(results, q, onProjectSelect);
  } catch (err) {
    console.error('Search error:', err);
  }
}

/** Hide results and show normal project list */
export function clearSearchResults() {
  document.getElementById('search-results-container').classList.add('hidden');
  document.getElementById('project-list-container').classList.remove('hidden');
}

/**
 * Wrap matching substrings in <mark> for a plain text field.
 * Works on original text, HTML-escapes each segment, then wraps match in <mark>.
 */
function highlight(text, q) {
  if (!q || !text) return escHtml(text || '');
  const lower = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  let result = '';
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(lowerQ, pos)) !== -1) {
    result += escHtml(text.slice(pos, idx));
    result += `<mark class="search-highlight">${escHtml(text.slice(idx, idx + q.length))}</mark>`;
    pos = idx + q.length;
  }
  result += escHtml(text.slice(pos));
  return result;
}

function renderSearchResults(results, q, onProjectSelect) {
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
        <div class="search-result-main">${highlight(p.name, q)}</div>
        <div class="search-result-meta muted-text">${p.source_count} source${p.source_count !== 1 ? 's' : ''} · ${p.file_count} file${p.file_count !== 1 ? 's' : ''}</div>
      </div>
    `).join('');
  }

  if (results.sources.length > 0) {
    html += `<div class="search-section-label">Sources (${results.sources.length})</div>`;
    html += results.sources.map(s => `
      <div class="search-result-row" data-project-id="${s.project_id}">
        <div class="search-result-main">${highlight(s.label, q)}</div>
        <div class="search-result-meta muted-text mono">${highlight(s.url, q)}</div>
        <div class="search-result-badge">in: ${escHtml(s.project_name)}</div>
      </div>
    `).join('');
  }

  if (results.tags.length > 0) {
    html += `<div class="search-section-label">Tags (${results.tags.length})</div>`;
    html += results.tags.map(t => `
      <div class="search-result-row" data-project-id="${t.project_id}">
        <div class="search-result-main">
          <span class="badge-tag" style="background:${escHtml(t.color)}">${highlight(t.name, q)}</span>
        </div>
        <div class="search-result-badge">in: ${escHtml(t.project_name)}</div>
      </div>
    `).join('');
  }

  if (results.files.length > 0) {
    html += `<div class="search-section-label">Files (${results.files.length})</div>`;
    html += results.files.map(f => {
      const parts = f.key.split('::');
      const s3Key = parts.length > 1 ? parts.slice(1).join('::') : f.key;
      const filename = s3Key.split('/').pop() || s3Key;
      const date = f.last_modified ? formatDate(new Date(f.last_modified)) : '';
      const hiddenBadge = f.is_hidden ? '<span class="badge-hidden-file">HIDDEN</span>' : '';
      const commentBadge = f.comment ? `<span class="search-result-comment muted-text">"${highlight(f.comment, q)}"</span>` : '';
      return `
        <div class="search-result-row${f.is_hidden ? ' search-result-hidden' : ''}" data-project-id="${f.project_id}" data-file-key="${escHtml(f.key)}">
          <div class="search-result-main mono">${hiddenBadge}${highlight(filename, q)}</div>
          <div class="search-result-meta muted-text">${highlight(s3Key, q)}</div>
          <div class="search-result-badge">in: ${escHtml(f.project_name)} · ${escHtml(f.source_label)}${date ? ' · ' + date : ''}${commentBadge}</div>
        </div>
      `;
    }).join('');
  }

  container.innerHTML = html;
  listContainer.classList.add('hidden');
  container.classList.remove('hidden');

  // Bind clicks — navigate to project, optionally highlight specific file
  container.querySelectorAll('.search-result-row[data-project-id]').forEach(row => {
    row.addEventListener('click', () => {
      const projectId = Number(row.dataset.projectId);
      const fileKey = row.dataset.fileKey || null;
      onProjectSelect(projectId, fileKey);
    });
  });
}
