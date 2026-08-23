import { state } from './state.js';

export function updateHiddenButton() {
  const count = state.hiddenKeys.size;
  const btn = document.getElementById('btn-show-hidden');
  document.getElementById('hidden-count').textContent = count;
  btn.classList.toggle('hidden', count === 0);
  btn.classList.toggle('btn-filter-new-active', state.showHidden);
}
