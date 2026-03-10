// UI rendering: file list, stats bar, source dropdown, tag filter dropdown

import { state, getVisibleFiles } from './state.js';
import { sortFiles } from './sort-filter.js';
import { buildTable } from './render-table.js';
import { escHtml } from './utils.js';

export function renderFileList() {
  const main = document.getElementById('main-content');
  const visibleFiles = getVisibleFiles();

  if (state.allFiles.length === 0) {
    main.innerHTML = '<div class="empty-state">No files. Add sources and click ⬇ Fetch All.</div>';
    return;
  }
  if (visibleFiles.length === 0) {
    main.innerHTML = '<div class="empty-state">No files match the current filter.</div>';
    return;
  }

  const sorted = sortFiles(visibleFiles, state.sortCol, state.sortDir);
  main.innerHTML = '';

  if (state.viewMode === 'all') {
    main.appendChild(buildTable(sorted, state.sortCol, state.sortDir));
    return;
  }

  // By Source view — group + collapsible sections
  const groups = {};
  for (const f of sorted) {
    if (!groups[f.sourceLabel]) groups[f.sourceLabel] = [];
    groups[f.sourceLabel].push(f);
  }

  for (const [label, files] of Object.entries(groups)) {
    const section = document.createElement('div');
    section.className = 'source-group';

    const newCount = files.filter(f => f.isNew).length;
    const header = document.createElement('div');
    header.className = 'source-group-header';
    header.innerHTML = `
      <span class="source-group-label">${escHtml(label)}</span>
      <span class="source-group-count">${files.length} files${newCount ? ` · <span class="text-new">${newCount} NEW</span>` : ''}</span>
      <span class="source-group-toggle">▼</span>
    `;
    const body = document.createElement('div');
    body.className = 'source-group-body';
    body.appendChild(buildTable(files, state.sortCol, state.sortDir));

    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      header.querySelector('.source-group-toggle').textContent = collapsed ? '▶' : '▼';
    });

    section.appendChild(header);
    section.appendChild(body);
    main.appendChild(section);
  }
}

export function renderStats() {
  const statsBar = document.getElementById('stats-bar');
  if (state.allFiles.length === 0) { statsBar.classList.add('hidden'); return; }
  statsBar.classList.remove('hidden');

  const visible = getVisibleFiles();
  const newCount = visible.filter(f => f.isNew).length;

  const sourceCounts = {};
  for (const f of visible) sourceCounts[f.sourceLabel] = (sourceCounts[f.sourceLabel] || 0) + 1;
  const sourceText = Object.entries(sourceCounts).map(([l, c]) => `${escHtml(l)}: ${c}`).join(' | ');

  document.getElementById('stat-total').textContent = `Total: ${visible.length} files`;
  document.getElementById('stat-new').innerHTML = newCount ? `<span class="text-new">${newCount} NEW</span>` : '0 new';
  document.getElementById('stat-sources').innerHTML = sourceText;
}

// Render source dropdown list items + update count badge
export function renderSourceDropdown() {
  if (state.sources.length === 0) {
    document.getElementById('source-dropdown').classList.add('hidden');
    return;
  }
  document.getElementById('source-dropdown').classList.remove('hidden');

  // Update button count badge
  const selected = state.sources.filter(s => state.activeSourceIds.has(s.id)).length;
  document.getElementById('source-dropdown-count').textContent = `(${selected}/${state.sources.length})`;

  // Filter list by sourceSearch input
  const q = state.sourceSearch.toLowerCase();
  const filtered = state.sources.filter(s => s.label.toLowerCase().includes(q));

  const list = document.getElementById('source-dropdown-list');
  list.innerHTML = '';
  for (const src of filtered) {
    const item = document.createElement('label');
    item.className = 'source-dropdown-item';
    const checked = state.activeSourceIds.has(src.id) ? 'checked' : '';
    item.innerHTML = `
      <input type="checkbox" data-source-id="${src.id}" ${checked} />
      <span>${escHtml(src.label)}</span>
    `;
    item.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) state.activeSourceIds.add(src.id);
      else state.activeSourceIds.delete(src.id);
      renderSourceDropdown();
      renderFileList();
      renderStats();
    });
    list.appendChild(item);
  }
}

// Render tag filter dropdown list items + update count badge
export function renderTagFilter() {
  const dropdown = document.getElementById('tag-filter-dropdown');
  if (!dropdown) return;

  if (state.tags.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  dropdown.classList.remove('hidden');

  const selected = state.tags.filter(t => state.activeTagIds.has(t.id)).length;
  document.getElementById('tag-filter-count').textContent = selected ? `(${selected})` : '';

  const list = document.getElementById('tag-filter-list');
  list.innerHTML = '';
  for (const tag of state.tags) {
    const item = document.createElement('label');
    item.className = 'source-dropdown-item';
    const checked = state.activeTagIds.has(tag.id) ? 'checked' : '';
    item.innerHTML = `
      <input type="checkbox" data-tag-id="${tag.id}" ${checked} />
      <span class="badge-tag" style="background:${tag.color}">${escHtml(tag.name)}</span>
    `;
    item.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) state.activeTagIds.add(tag.id);
      else state.activeTagIds.delete(tag.id);
      renderTagFilter();
      renderFileList();
      renderStats();
    });
    list.appendChild(item);
  }
}
