// Manage Sources modal: open/close, add/edit/delete sources

import { state } from './state.js';
import { apiAddSource, apiUpdateSource, apiDeleteSource, apiProxyFetch } from './api.js';
import { parseS3Xml } from './parse.js';
import { renderSourceDropdown } from './render-ui.js';
import { escHtml } from './utils.js';

export function openModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
  renderSourcesList();
  document.getElementById('input-label').focus();
}

export function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  clearAddForm();
}

function clearAddForm() {
  document.getElementById('input-label').value = '';
  document.getElementById('input-url').value = '';
  showAddError('');
}

function showAddError(msg) {
  const el = document.getElementById('add-source-error');
  el.textContent = msg;
  el.classList.toggle('hidden', !msg);
}

export function renderSourcesList() {
  const container = document.getElementById('sources-list');
  if (state.sources.length === 0) {
    container.innerHTML = '<div class="muted-text">No sources yet.</div>';
    return;
  }
  container.innerHTML = '';
  for (const src of state.sources) {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.dataset.id = src.id;
    row.innerHTML = `
      <div class="source-row-info">
        <span class="source-row-label">${escHtml(src.label)}</span>
        <span class="source-row-url mono">${escHtml(src.url)}</span>
      </div>
      <div class="source-row-actions">
        <button class="btn btn-sm btn-edit" data-id="${src.id}">Edit</button>
        <button class="btn btn-sm btn-danger" data-id="${src.id}">Del</button>
      </div>
    `;
    row.querySelector('.btn-edit').addEventListener('click', () => startEditSource(src));
    row.querySelector('.btn-danger').addEventListener('click', () => deleteSource(src.id));
    container.appendChild(row);
  }
}

function startEditSource(src) {
  const container = document.getElementById('sources-list');
  const row = container.querySelector(`[data-id="${src.id}"]`);
  if (!row) return;

  row.innerHTML = `
    <div class="source-edit-form">
      <input type="text" class="input-control edit-label" value="${escHtml(src.label)}" placeholder="Label" />
      <input type="url" class="input-control edit-url" value="${escHtml(src.url)}" placeholder="URL" />
      <div class="edit-actions">
        <button class="btn btn-primary btn-sm btn-save">Save</button>
        <button class="btn btn-sm btn-cancel-edit">Cancel</button>
      </div>
    </div>
    <div class="edit-error form-error hidden"></div>
  `;
  row.querySelector('.btn-save').addEventListener('click', async () => {
    const newLabel = row.querySelector('.edit-label').value.trim();
    const newUrl = row.querySelector('.edit-url').value.trim();
    const errEl = row.querySelector('.edit-error');
    if (!newLabel || !newUrl) { errEl.textContent = 'Both fields required'; errEl.classList.remove('hidden'); return; }
    if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
      errEl.textContent = 'URL must start with http:// or https://'; errEl.classList.remove('hidden'); return;
    }
    try {
      const updated = await apiUpdateSource(src.id, newLabel, newUrl);
      const idx = state.sources.findIndex(s => s.id === src.id);
      if (idx >= 0) state.sources[idx] = updated;
      renderSourcesList();
      renderSourceDropdown();
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
    }
  });
  row.querySelector('.btn-cancel-edit').addEventListener('click', () => renderSourcesList());
}

async function deleteSource(id) {
  if (!confirm('Delete this source?')) return;
  try {
    await apiDeleteSource(id);
    state.sources = state.sources.filter(s => s.id !== id);
    state.activeSourceIds.delete(id);
    renderSourcesList();
    renderSourceDropdown();
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

export async function addSource() {
  const label = document.getElementById('input-label').value.trim();
  const url = document.getElementById('input-url').value.trim();
  if (!label || !url) { showAddError('Both fields required'); return; }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    showAddError('URL must start with http:// or https://'); return;
  }

  // Validate: fetch + parse the S3 XML before saving
  const btn = document.getElementById('btn-add-source');
  btn.disabled = true;
  btn.textContent = 'Validating…';
  showAddError('');
  try {
    const xmlText = await apiProxyFetch(url);
    parseS3Xml(xmlText, { label, url }); // throws on invalid XML / non-S3 response
  } catch (err) {
    showAddError('Connection failed: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Add';
    return;
  }

  try {
    const newSrc = await apiAddSource(label, url, state.currentProject?.id);
    state.sources.push(newSrc);
    state.activeSourceIds.add(newSrc.id);
    clearAddForm();
    renderSourcesList();
    renderSourceDropdown();
  } catch (err) {
    showAddError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add';
  }
}
