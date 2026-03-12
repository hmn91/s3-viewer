// Tag Manager Modal — create, rename, recolor, delete tags

import { state } from './state.js';
import { apiCreateTag, apiUpdateTag, apiDeleteTag } from './api-tags.js';
import { renderTagFilter, renderFileList } from './render-ui.js';
import { escHtml } from './utils.js';

const PRESET_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6',
];

let selectedColor = PRESET_COLORS[0];

export function openTagModal() {
  renderTagModal();
  document.getElementById('tag-modal-overlay').classList.remove('hidden');
}

export function closeTagModal() {
  document.getElementById('tag-modal-overlay').classList.add('hidden');
}

function renderTagModal() {
  renderColorPicker();
  renderTagList();
  bindAddTag();
}

function renderColorPicker() {
  const picker = document.getElementById('tag-color-picker');
  picker.innerHTML = '';
  for (const color of PRESET_COLORS) {
    const swatch = document.createElement('div');
    swatch.className = 'tag-color-swatch' + (color === selectedColor ? ' selected' : '');
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      selectedColor = color;
      renderColorPicker();
    });
    picker.appendChild(swatch);
  }
}

function renderTagList() {
  const list = document.getElementById('tags-list');
  list.innerHTML = '';

  if (state.tags.length === 0) {
    list.innerHTML = '<div class="muted-text">No tags yet. Create one above.</div>';
    return;
  }

  for (const tag of state.tags) {
    const usageCount = state.allFiles.filter(f =>
      f.tags && f.tags.some(t => t.id === tag.id)
    ).length;

    const row = document.createElement('div');
    row.className = 'tag-row';
    row.dataset.tagId = tag.id;
    row.innerHTML = `
      <div class="tag-row-info">
        <span class="badge-tag" style="background:${tag.color}">${escHtml(tag.name)}</span>
        <span class="muted-text">${usageCount} file${usageCount !== 1 ? 's' : ''}</span>
      </div>
      <div class="tag-row-actions">
        <button class="btn btn-sm btn-edit btn-edit-tag">Edit</button>
        <button class="btn btn-sm btn-danger btn-delete-tag">Delete</button>
      </div>
    `;

    row.querySelector('.btn-edit-tag').addEventListener('click', () => startEdit(row, tag));
    row.querySelector('.btn-delete-tag').addEventListener('click', () => deleteTag(tag, usageCount));
    list.appendChild(row);
  }
}

function startEdit(row, tag) {
  const info = row.querySelector('.tag-row-info');
  const actions = row.querySelector('.tag-row-actions');

  // Build inline edit color picker
  const colorSwatches = PRESET_COLORS.map(c =>
    `<div class="tag-color-swatch${c === tag.color ? ' selected' : ''}"
          style="background:${c}" data-color="${c}"></div>`
  ).join('');

  info.innerHTML = `
    <input class="tag-edit-input" value="${escHtml(tag.name)}" />
    <div class="tag-color-picker">${colorSwatches}</div>
  `;
  actions.innerHTML = `
    <button class="btn btn-sm btn-primary btn-save-tag">Save</button>
    <button class="btn btn-sm btn-secondary btn-cancel-edit">Cancel</button>
  `;

  let editColor = tag.color;
  info.querySelectorAll('.tag-color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      info.querySelectorAll('.tag-color-swatch').forEach(x => x.classList.remove('selected'));
      s.classList.add('selected');
      editColor = s.dataset.color;
    });
  });

  actions.querySelector('.btn-cancel-edit').addEventListener('click', renderTagList);
  actions.querySelector('.btn-save-tag').addEventListener('click', async () => {
    const newName = info.querySelector('.tag-edit-input').value.trim();
    if (!newName) return;
    try {
      const updated = await apiUpdateTag(tag.id, newName, editColor);
      const idx = state.tags.findIndex(t => t.id === tag.id);
      if (idx !== -1) state.tags[idx] = updated;
      // Sync tag data in allFiles
      state.allFiles.forEach(f => {
        if (f.tags) f.tags = f.tags.map(t => t.id === updated.id ? updated : t);
      });
      renderTagList();
      renderTagFilter();
      renderFileList(); // refresh tag badges in file rows
    } catch (err) {
      showError(err.message);
    }
  });
}

async function deleteTag(tag, usageCount) {
  const msg = usageCount > 0
    ? `Delete tag "${tag.name}"? Used by ${usageCount} file${usageCount !== 1 ? 's' : ''}.`
    : `Delete tag "${tag.name}"?`;
  if (!confirm(msg)) return;
  try {
    await apiDeleteTag(tag.id);
    state.tags = state.tags.filter(t => t.id !== tag.id);
    state.activeTagIds.delete(tag.id);
    // Remove tag from allFiles
    state.allFiles.forEach(f => {
      if (f.tags) f.tags = f.tags.filter(t => t.id !== tag.id);
    });
    renderTagList();
    renderTagFilter();
    renderFileList(); // refresh tag badges + remove deleted tag from file rows
  } catch (err) {
    showError(err.message);
  }
}

function bindAddTag() {
  const btn = document.getElementById('btn-add-tag');
  // Replace to avoid duplicate listeners
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    const nameInput = document.getElementById('input-tag-name');
    const name = nameInput.value.trim();
    if (!name) return;
    hideError();
    try {
      const tag = await apiCreateTag(name, selectedColor, state.currentProject?.id);
      state.tags.push(tag);
      nameInput.value = '';
      renderTagList();
      renderTagFilter();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById('input-tag-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') newBtn.click();
  });
}

function showError(msg) {
  const el = document.getElementById('add-tag-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('add-tag-error').classList.add('hidden');
}
