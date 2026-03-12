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
    // By-source view: no sortable headers (sort is per-group visual, not global)
    body.appendChild(buildTable(files, null, null));

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
  // newCount: count across all visible sources (ignore filterNew so badge always shows total new)
  const newCount = state.allFiles.filter(f =>
    f.isNew &&
    (state.activeSourceIds.size === state.sources.length || state.activeSourceIds.has(f.sourceId))
  ).length;

  const total = state.allFiles.length;
  const showing = visible.length;
  document.getElementById('stat-total').textContent =
    showing < total ? `Showing: ${showing} / ${total} files` : `Total: ${total} files`;

  // NEW count — clickable toggle (green text, highlighted bg when active)
  const statNew = document.getElementById('stat-new');
  if (newCount) {
    const active = state.filterNew;
    statNew.innerHTML = `<span class="stat-clickable text-new${active ? ' stat-active' : ''}">${newCount} NEW</span>`;
    statNew.querySelector('.stat-clickable').addEventListener('click', () => {
      state.filterNew = !state.filterNew;
      renderFileList();
      renderStats();
    });
  } else {
    statNew.textContent = '0 new';
  }

  // Source counts — per source from visible files, each clickable
  // "isolate source" shortcut: sets activeSourceIds to just that source; click again = show all
  const sourceCounts = {};
  for (const f of visible) sourceCounts[f.sourceLabel] = (sourceCounts[f.sourceLabel] || 0) + 1;
  // Also count sources that are filtered out (not visible) so they still appear in stats bar
  const allSourceCounts = {};
  for (const f of state.allFiles) allSourceCounts[f.sourceLabel] = (allSourceCounts[f.sourceLabel] || 0) + 1;

  const statSources = document.getElementById('stat-sources');
  statSources.innerHTML = '';
  const allOnlyOne = state.activeSourceIds.size === 1; // dropdown is isolating one source

  Object.entries(allSourceCounts).forEach(([label, totalCount], i) => {
    if (i > 0) statSources.appendChild(document.createTextNode(' | '));
    const span = document.createElement('span');
    // Find source IDs for this label
    const idsForLabel = state.sources.filter(s => s.label === label).map(s => s.id);
    const isIsolated = allOnlyOne && idsForLabel.some(id => state.activeSourceIds.has(id));
    const visibleCount = sourceCounts[label] || 0;

    span.className = `stat-clickable${isIsolated ? ' stat-active' : ''}`;
    span.textContent = `${label}: ${visibleCount}/${totalCount}`;
    span.title = isIsolated ? 'Click to show all sources' : `Click to filter by "${label}"`;
    span.addEventListener('click', () => {
      if (isIsolated) {
        // Toggle off: restore all sources
        state.activeSourceIds = new Set(state.sources.map(s => s.id));
      } else {
        // Isolate this source
        state.activeSourceIds = new Set(idsForLabel);
      }
      renderSourceDropdown();
      renderFileList();
      renderStats();
    });
    statSources.appendChild(span);
  });
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
      renderSourceDropdown(); // only update count badge, not file list
    });
    list.appendChild(item);
  }
}

// Render tag filter dropdown — tag checkboxes + "No Tag" option + apply validation
export function renderTagFilter() {
  const dropdown = document.getElementById('tag-filter-dropdown');
  if (!dropdown) return;

  if (state.tags.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }
  dropdown.classList.remove('hidden');

  // Badge: only show when actively filtering (not all selected = "show all" default)
  const allTagsSelected = state.filterNoTag && state.activeTagIds.size === state.tags.length;
  const selectedCount = allTagsSelected ? 0
    : state.tags.filter(t => state.activeTagIds.has(t.id)).length + (state.filterNoTag ? 1 : 0);
  document.getElementById('tag-filter-count').textContent = selectedCount ? `(${selectedCount})` : '';

  // Filter list by tagSearch
  const q = state.tagSearch.toLowerCase();
  const filtered = state.tags.filter(t => t.name.toLowerCase().includes(q));

  const list = document.getElementById('tag-filter-list');
  list.innerHTML = '';

  // "No Tag" option — shown when search is empty (not filtered by search)
  if (!q) {
    const noTagItem = document.createElement('label');
    noTagItem.className = 'source-dropdown-item';
    noTagItem.innerHTML = `
      <input type="checkbox" ${state.filterNoTag ? 'checked' : ''} />
      <span class="badge-tag badge-tag-notag">No Tag</span>
    `;
    noTagItem.querySelector('input').addEventListener('change', e => {
      state.filterNoTag = e.target.checked;
      renderTagFilter();
    });
    list.appendChild(noTagItem);
  }

  for (const tag of filtered) {
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
    });
    list.appendChild(item);
  }

  // Disable Apply if nothing selected — enforce at least 1 option
  const applyBtn = document.getElementById('btn-apply-tag-filter');
  const nothingSelected = state.activeTagIds.size === 0 && !state.filterNoTag;
  applyBtn.disabled = nothingSelected;
  applyBtn.title = nothingSelected ? 'Select at least one tag or "No Tag"' : '';
}
