// UI rendering: file list, stats bar, source filter

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

  const sorted = sortFiles(visibleFiles, state.sortBy);
  main.innerHTML = '';

  if (state.viewMode === 'all') {
    main.appendChild(buildTable(sorted));
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
    body.appendChild(buildTable(files));

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

export function renderSourceFilter() {
  const container = document.getElementById('source-filter');
  if (state.viewMode !== 'all' || state.sources.length === 0) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  container.innerHTML = '<span class="filter-label">Sources:</span>';

  for (const src of state.sources) {
    const label = document.createElement('label');
    label.className = 'filter-checkbox';
    const checked = state.activeSourceIds.has(src.id);
    label.innerHTML = `
      <input type="checkbox" data-source-id="${src.id}" ${checked ? 'checked' : ''} />
      ${escHtml(src.label)}
    `;
    label.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) state.activeSourceIds.add(src.id);
      else state.activeSourceIds.delete(src.id);
      renderFileList();
      renderStats();
    });
    container.appendChild(label);
  }
}
