// File table and row building

import { escHtml, formatSize, formatDate, getSourceColor } from './utils.js';

export function buildFileRow(file) {
  const tr = document.createElement('tr');
  tr.className = 'file-row';
  tr.title = file.key;
  tr.addEventListener('click', () => window.open(file.url, '_blank'));

  const color = getSourceColor(file.sourceLabel);
  tr.innerHTML = `
    <td class="col-new">${file.isNew ? '<span class="badge-new">NEW</span>' : ''}</td>
    <td class="col-name"><span class="file-name">${escHtml(file.displayName)}</span></td>
    <td class="col-folder mono">${escHtml(file.folder || '/')}</td>
    <td class="col-source"><span class="badge-source" style="background:${color}">${escHtml(file.sourceLabel)}</span></td>
    <td class="col-size mono">${formatSize(file.size)}</td>
    <td class="col-modified mono">${formatDate(file.lastModified)}</td>
    <td class="col-seen mono">${file.firstSeen ? formatDate(new Date(file.firstSeen)) : '—'}</td>
  `;
  return tr;
}

export function buildTable(files) {
  const table = document.createElement('table');
  table.className = 'file-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-new"></th>
        <th class="col-name">Filename</th>
        <th class="col-folder">Folder</th>
        <th class="col-source">Source</th>
        <th class="col-size">Size</th>
        <th class="col-modified">Last Modified</th>
        <th class="col-seen">First Seen</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');
  files.forEach(f => tbody.appendChild(buildFileRow(f)));
  table.appendChild(tbody);
  return table;
}
