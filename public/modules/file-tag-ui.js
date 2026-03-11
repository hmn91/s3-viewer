// Inline tag picker popover: search-driven, recent tags, create on-the-fly, stays open
// Keyboard nav: ArrowDown/Up to navigate items; any printable key returns to search input

import { state } from './state.js';
import { apiAssignTag, apiRemoveTag, apiCreateTag } from './api-tags.js';
import { renderFileList, renderTagFilter } from './render-ui.js';
import { escHtml } from './utils.js';

let activePopover = null;
let activeScrollHandler = null; // scroll listener cleanup ref

// Persist recent tag IDs across page loads
const RECENT_STORAGE_KEY = 's3viewer_recent_tags';
let recentTagIds = (() => {
  try { return JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]'); }
  catch { return []; }
})();

const PRESET_COLORS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#8b5cf6','#14b8a6'];
let colorIdx = 0;

export function closeAllTagPickers() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  if (activeScrollHandler) {
    window.removeEventListener('scroll', activeScrollHandler, true);
    activeScrollHandler = null;
  }
}

// Reposition popover relative to anchor.
// Hides popover (visibility:hidden) when anchor scrolls out of view; shows it again on re-entry.
function positionPopover(popover, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  // Anchor out of viewport — keep picker alive but invisible
  if (rect.bottom < 0 || rect.top > vh) {
    popover.style.visibility = 'hidden';
    return;
  }

  const ph = popover.offsetHeight;
  const pw = popover.offsetWidth;
  const GAP = 4;
  // Respect sticky subheader (toolbar + stats bar) so picker doesn't overlap it
  const stickyEl = document.querySelector('.sticky-subheader') || document.querySelector('.header');
  const minTop = stickyEl ? stickyEl.getBoundingClientRect().bottom + GAP : GAP;

  const topBelow = rect.bottom + GAP;
  const topAbove = rect.top - ph - GAP;
  const top = topBelow + ph > vh && topAbove >= minTop ? topAbove : topBelow;
  const left = Math.min(rect.left, vw - pw - GAP);

  popover.style.top = `${Math.max(minTop, top)}px`;
  popover.style.left = `${Math.max(GAP, left)}px`;
  popover.style.visibility = 'visible';
}

export function openTagPicker(anchorEl, fileKey) {
  closeAllTagPickers();

  const file = state.allFiles.find(f => f.key === fileKey);
  if (!file) return;

  const popover = document.createElement('div');
  popover.className = 'tag-picker-popover';
  popover.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(popover);
  activePopover = popover;

  mountPicker(popover, file);

  // Initial position (after mount so offsetHeight is available)
  positionPopover(popover, anchorEl);

  // Reposition on any scroll (capture phase to catch scrolling inside #main-content)
  activeScrollHandler = () => {
    if (!document.body.contains(anchorEl)) { closeAllTagPickers(); return; }
    positionPopover(popover, anchorEl);
  };
  window.addEventListener('scroll', activeScrollHandler, { passive: true, capture: true });
}

function mountPicker(popover, file) {
  const assignedIds = new Set((file.tags || []).map(t => t.id));

  popover.innerHTML = `
    <input class="tag-picker-search" type="text" placeholder="Search or create tag…" autocomplete="off" />
    <div class="tag-picker-body"></div>
  `;

  const searchInput = popover.querySelector('.tag-picker-search');
  const body = popover.querySelector('.tag-picker-body');

  // Returns all keyboard-navigable items in body
  function getItems() {
    return [...body.querySelectorAll('.tag-picker-item[tabindex], .tag-picker-create-btn')];
  }

  function refresh(query = '') {
    body.innerHTML = '';
    const q = query.toLowerCase().trim();
    const allTags = state.tags;

    if (!q) {
      // No query: show only Recent tags (no "All tags" dump)
      const recentTags = recentTagIds.map(id => allTags.find(t => t.id === id)).filter(Boolean);
      if (recentTags.length > 0) {
        const label = document.createElement('div');
        label.className = 'tag-picker-section-label';
        label.textContent = 'Recent';
        body.appendChild(label);
        recentTags.forEach(tag => body.appendChild(buildTagItem(tag, assignedIds, file, searchInput, refresh, getItems)));
      } else if (allTags.length === 0) {
        appendEmpty(body, 'No tags yet. Type a name to create one.');
      } else {
        appendEmpty(body, 'Type to search tags.');
      }
      return;
    }

    // Has query: show filtered results
    const matched = allTags.filter(t => t.name.toLowerCase().includes(q));
    matched.forEach(tag => body.appendChild(buildTagItem(tag, assignedIds, file, searchInput, refresh, getItems)));

    const exactMatch = allTags.some(t => t.name.toLowerCase() === q);
    if (!exactMatch) {
      const createBtn = document.createElement('button');
      createBtn.className = 'tag-picker-create-btn';
      createBtn.innerHTML = `＋ Create "<strong>${escHtml(query)}</strong>"`;
      createBtn.addEventListener('click', async () => {
        await createAndAssign(query, file, assignedIds);
        searchInput.value = '';
        refresh('');
        requestAnimationFrame(() => searchInput.focus());
      });
      createBtn.addEventListener('keydown', e => {
        if (e.key === 'Enter') return; // handled by click
        handleNavKey(e, createBtn, searchInput, getItems);
      });
      body.appendChild(createBtn);
    }

    if (matched.length === 0 && exactMatch) {
      appendEmpty(body, 'No other matches.');
    }
  }

  // Search input keyboard handling
  searchInput.addEventListener('input', e => refresh(e.target.value));
  searchInput.addEventListener('keydown', async e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const items = getItems();
      if (items.length > 0) items[0].focus();
      return;
    }
    if (e.key !== 'Enter') return;
    const query = searchInput.value.trim();
    if (!query) return;
    e.preventDefault();
    const exact = state.tags.find(t => t.name.toLowerCase() === query.toLowerCase());
    if (exact) {
      await toggleTag(exact, file, assignedIds);
    } else {
      await createAndAssign(query, file, assignedIds);
    }
    searchInput.value = '';
    refresh('');
    // requestAnimationFrame ensures focus runs after browser finishes all pending DOM/focus events
    requestAnimationFrame(() => searchInput.focus());
  });

  refresh('');
  searchInput.focus();
}

function buildTagItem(tag, assignedIds, file, searchInput, refresh, getItems) {
  const item = document.createElement('div');
  item.className = 'tag-picker-item' + (assignedIds.has(tag.id) ? ' assigned' : '');
  item.tabIndex = 0;
  item.innerHTML = `
    <span class="badge-tag" style="background:${tag.color}">${escHtml(tag.name)}</span>
    ${assignedIds.has(tag.id) ? '<span class="tag-picker-check">✓</span>' : ''}
  `;

  const activate = async () => {
    await toggleTag(tag, file, assignedIds);
    refresh(searchInput.value);
    requestAnimationFrame(() => searchInput.focus());
  };

  item.addEventListener('click', activate);
  item.addEventListener('keydown', async e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); await activate(); return; }
    handleNavKey(e, item, searchInput, getItems);
  });

  return item;
}

function handleNavKey(e, el, searchInput, getItems) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const items = getItems();
    const idx = items.indexOf(el);
    if (idx < items.length - 1) items[idx + 1].focus();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const items = getItems();
    const idx = items.indexOf(el);
    if (idx > 0) items[idx - 1].focus();
    else searchInput.focus();
    return;
  }
  // Any printable character: send focus back to search input and let the key land there
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    searchInput.focus();
    // Let browser naturally append the char to the now-focused input
  }
}

async function toggleTag(tag, file, assignedIds) {
  if (assignedIds.has(tag.id)) {
    try {
      await apiRemoveTag(file.key, tag.id);
      file.tags = (file.tags || []).filter(t => t.id !== tag.id);
      assignedIds.delete(tag.id);
      renderFileList();
    } catch (err) { console.error('Remove tag failed:', err); }
  } else {
    try {
      await apiAssignTag(file.key, tag.id);
      if (!file.tags) file.tags = [];
      if (!file.tags.find(t => t.id === tag.id)) {
        file.tags.push({ id: tag.id, name: tag.name, color: tag.color });
      }
      assignedIds.add(tag.id);
      addRecent(tag.id);
      renderFileList();
    } catch (err) { console.error('Assign tag failed:', err); }
  }
}

async function createAndAssign(name, file, assignedIds) {
  try {
    const color = PRESET_COLORS[colorIdx % PRESET_COLORS.length];
    colorIdx++;
    const newTag = await apiCreateTag(name, color);
    state.tags.push(newTag);
    renderTagFilter();
    await toggleTag(newTag, file, assignedIds);
  } catch (err) { console.error('Create tag failed:', err); }
}

function addRecent(tagId) {
  recentTagIds = [tagId, ...recentTagIds.filter(id => id !== tagId)].slice(0, 5);
  try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentTagIds)); } catch {}
}

function appendEmpty(body, msg) {
  const el = document.createElement('div');
  el.className = 'tag-picker-empty';
  el.textContent = msg;
  body.appendChild(el);
}
