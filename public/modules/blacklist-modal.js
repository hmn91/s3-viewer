// Manage project-scoped automatic-hide blacklist rules.

import { state } from './state.js';
import {
  apiCreateBlacklistRule,
  apiDeleteBlacklistRule,
  apiGetBlacklistRules,
} from './api-blacklist.js';
import { escHtml } from './utils.js';

const TYPE_LABELS = {
  file_type: 'File extension',
  url_prefix: 'URL prefix',
  url_suffix: 'URL suffix',
};

const TYPE_HELP = {
  file_type: 'Examples: pdf, .tmp, *.tar.gz. Matching is case-insensitive.',
  url_prefix: 'Example: https://bucket.example.com/cache/. Matching is case-sensitive.',
  url_suffix: 'Example: ?download=false or /placeholder. Matching is case-sensitive.',
};

export async function openBlacklistModal() {
  document.getElementById('blacklist-modal-overlay').classList.remove('hidden');
  renderBlacklistRules();
  updateBlacklistHelp();
  document.getElementById('blacklist-value').focus();

  try {
    state.blacklistRules = await apiGetBlacklistRules(state.currentProject?.id);
    renderBlacklistRules();
  } catch (err) {
    showBlacklistError(err.message);
  }
}

export function closeBlacklistModal() {
  document.getElementById('blacklist-modal-overlay').classList.add('hidden');
  document.getElementById('blacklist-value').value = '';
  showBlacklistError('');
}

export function updateBlacklistHelp() {
  const type = document.getElementById('blacklist-rule-type').value;
  document.getElementById('blacklist-rule-help').textContent = TYPE_HELP[type] || '';
  const input = document.getElementById('blacklist-value');
  input.placeholder = type === 'file_type' ? 'e.g. pdf or .tmp' : 'Enter full or partial URL';
}

export async function addBlacklistRule() {
  const type = document.getElementById('blacklist-rule-type').value;
  const input = document.getElementById('blacklist-value');
  const value = input.value.trim();
  if (!value) return showBlacklistError('Rule value is required');

  const btn = document.getElementById('btn-add-blacklist-rule');
  btn.disabled = true;
  showBlacklistError('');
  try {
    const rule = await apiCreateBlacklistRule(state.currentProject?.id, type, value);
    state.blacklistRules.push(rule);
    input.value = '';
    renderBlacklistRules();
    input.focus();
  } catch (err) {
    showBlacklistError(err.message);
  } finally {
    btn.disabled = false;
  }
}

function renderBlacklistRules() {
  const container = document.getElementById('blacklist-rules-list');
  if (state.blacklistRules.length === 0) {
    container.innerHTML = '<div class="muted-text">No blacklist rules. New rules apply on the next Fetch All.</div>';
    return;
  }

  container.innerHTML = '';
  const rules = [...state.blacklistRules].sort((a, b) =>
    a.rule_type.localeCompare(b.rule_type) || a.value.localeCompare(b.value)
  );
  for (const rule of rules) {
    const row = document.createElement('div');
    row.className = 'blacklist-rule-row';
    row.innerHTML = `
      <div class="blacklist-rule-info">
        <span class="blacklist-rule-type">${TYPE_LABELS[rule.rule_type] || escHtml(rule.rule_type)}</span>
        <code class="blacklist-rule-value">${escHtml(rule.value)}</code>
      </div>
      <button class="btn btn-sm btn-danger" type="button">Delete</button>
    `;
    row.querySelector('button').addEventListener('click', () => deleteRule(rule));
    container.appendChild(row);
  }
}

async function deleteRule(rule) {
  try {
    await apiDeleteBlacklistRule(rule.id, state.currentProject?.id);
    state.blacklistRules = state.blacklistRules.filter(item => item.id !== rule.id);
    renderBlacklistRules();
  } catch (err) {
    showBlacklistError(err.message);
  }
}

function showBlacklistError(message) {
  const error = document.getElementById('blacklist-error');
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}
