// File table and row building with sortable headers + inline filters + tag badges

import { escHtml, formatSize, formatDate, getSourceColor } from './utils.js';

const HEADERS = [
  { key: null,           label: '',              cls: 'col-new'      },
  { key: 'displayName',  label: 'Filename',      cls: 'col-name'     },
  { key: 'folder',       label: 'Folder',        cls: 'col-folder'   },
  { key: 'sourceLabel',  label: 'Source',        cls: 'col-source'   },
  { key: 'size',         label: 'Size',          cls: 'col-size'     },
  { key: 'lastModified', label: 'Last Modified', cls: 'col-modified' },
  { key: 'firstSeen',    label: 'First Seen',    cls: 'col-seen'     },
  { key: 'tags',         label: 'Tags',          cls: 'col-tags'     },
];

function sortIcon(col, sortCol, sortDir) {
  if (sortCol !== col) return '<span class="sort-icon">↕</span>';
  return sortDir === 'asc'
    ? '<span class="sort-icon active">↑</span>'
    : '<span class="sort-icon active">↓</span>';
}

export function buildFileRow(file) {
  const tr = document.createElement('tr');
  tr.className = 'file-row';
  // Only open URL when clicking the filename span, not the whole row
  // (prevents tag ＋ button and other row actions from opening the link)

  const color = getSourceColor(file.sourceLabel);
  const tagsHtml = (file.tags || []).map(t =>
    `<span class="badge-tag" style="background:${t.color}">${escHtml(t.name)}</span>`
  ).join('');

  tr.innerHTML = `
    <td class="col-new">${file.isNew ? '<span class="badge-new">NEW</span>' : ''}</td>
    <td class="col-name">
      <span class="file-name file-name-link">${escHtml(file.displayName)}</span>
      <div class="file-path-tooltip">${escHtml(file.url)}</div>
    </td>
    <td class="col-folder mono">${escHtml(file.folder || '/')}</td>
    <td class="col-source"><span class="badge-source" style="background:${color}">${escHtml(file.sourceLabel)}</span></td>
    <td class="col-size mono">${formatSize(file.size)}</td>
    <td class="col-modified mono">${formatDate(file.lastModified)}</td>
    <td class="col-seen mono">${file.firstSeen ? formatDate(new Date(file.firstSeen)) : '—'}</td>
    <td class="col-tags">
      <div class="file-tags">
        ${tagsHtml}
        <button class="btn-add-tag-inline" data-file-key="${escHtml(file.key)}" title="Add tag">＋</button>
      </div>
    </td>
  `;

  // Attach click-to-open only on the filename span (not the whole row)
  tr.querySelector('.file-name-link').addEventListener('click', e => {
    e.stopPropagation();
    window.open(file.url, '_blank');
  });

  return tr;
}

// Build full table with sortable column headers and active sort indicators
export function buildTable(files, sortCol, sortDir) {
  const table = document.createElement('table');
  table.className = 'file-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  for (const h of HEADERS) {
    const th = document.createElement('th');
    th.className = h.cls + (h.key && h.key !== 'tags' ? ' sortable' : '');
    if (h.key && h.key !== 'tags') th.dataset.col = h.key;

    if (h.key === 'displayName') {
      th.innerHTML = `Filename ${sortIcon('displayName', sortCol, sortDir)}`;
    } else if (h.key && h.key !== 'tags') {
      th.innerHTML = `${h.label} ${sortIcon(h.key, sortCol, sortDir)}`;
    } else {
      th.textContent = h.label;
    }
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  files.forEach(f => tbody.appendChild(buildFileRow(f)));
  table.appendChild(tbody);

  addResizeHandles(headerRow);
  return table;
}

function addResizeHandles(headerRow) {
  const ths = [...headerRow.querySelectorAll('th')];
  ths.forEach((th, i) => {
    if (i === ths.length - 1) return; // no handle on last column
    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    th.appendChild(handle);

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation(); // don't trigger sort click
      const startX = e.clientX;
      const startW = th.offsetWidth;
      handle.classList.add('dragging');

      const onMove = mv => {
        th.style.width = Math.max(40, startW + mv.clientX - startX) + 'px';
        th.style.minWidth = th.style.width;
      };
      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}
