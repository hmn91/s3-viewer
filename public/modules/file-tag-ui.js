// Inline tag picker popover: shown on ＋ button click in file rows

import { state } from './state.js';
import { apiAssignTag, apiRemoveTag } from './api-tags.js';
import { renderFileList } from './render-ui.js';
import { escHtml } from './utils.js';

let activePopover = null;

// Close and remove any open tag picker popover
export function closeAllTagPickers() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
}

// Open a tag picker popover anchored near the given button for the given fileKey
export function openTagPicker(anchorEl, fileKey) {
  closeAllTagPickers();

  if (state.tags.length === 0) return;

  const file = state.allFiles.find(f => f.key === fileKey);
  if (!file) return;

  const popover = document.createElement('div');
  popover.className = 'tag-picker-popover';
  renderPickerContent(popover, file);

  // Position relative to document
  document.body.appendChild(popover);
  activePopover = popover;

  const rect = anchorEl.getBoundingClientRect();
  popover.style.position = 'fixed';
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${rect.left}px`;
}

function renderPickerContent(popover, file) {
  if (state.tags.length === 0) {
    popover.innerHTML = '<div class="tag-picker-empty">No tags. Create tags via 🏷 Tags.</div>';
    return;
  }

  const assignedIds = new Set((file.tags || []).map(t => t.id));
  const list = document.createElement('div');
  list.className = 'tag-picker-list';

  for (const tag of state.tags) {
    const item = document.createElement('label');
    item.className = 'tag-picker-item';
    const checked = assignedIds.has(tag.id) ? 'checked' : '';
    item.innerHTML = `
      <input type="checkbox" ${checked} />
      <span class="badge-tag" style="background:${tag.color}">${escHtml(tag.name)}</span>
    `;

    item.querySelector('input').addEventListener('change', async e => {
      e.stopPropagation();
      try {
        if (e.target.checked) {
          await apiAssignTag(file.key, tag.id);
          if (!file.tags) file.tags = [];
          file.tags.push({ id: tag.id, name: tag.name, color: tag.color });
        } else {
          await apiRemoveTag(file.key, tag.id);
          file.tags = file.tags.filter(t => t.id !== tag.id);
        }
        renderFileList();
        // Re-render picker content in-place to reflect updated state
        popover.innerHTML = '';
        renderPickerContent(popover, file);
      } catch (err) {
        console.error('Tag toggle failed:', err);
      }
    });

    list.appendChild(item);
  }

  popover.appendChild(list);
}
