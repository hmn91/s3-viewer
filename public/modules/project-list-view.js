// Project list screen: render project cards, create/delete projects, view switching

import { apiCreateProject, apiDeleteProject } from './project-api.js';
import { escHtml, formatDate } from './utils.js';

// Callback set by app.js — called when user clicks a project row
let onProjectSelect = null;

export function setProjectSelectHandler(fn) {
  onProjectSelect = fn;
}

/** Switch to the project list view */
export function showProjectListView() {
  document.getElementById('view-projects').classList.remove('hidden');
  document.getElementById('view-project-detail').classList.add('hidden');
}

/** Switch to the file viewer view and update header title */
export function showProjectDetailView(project) {
  document.getElementById('view-projects').classList.add('hidden');
  document.getElementById('view-project-detail').classList.remove('hidden');
  document.getElementById('project-detail-title').textContent = project.name;
}

/**
 * Render the project list table.
 * @param {Array} projects — from GET /api/projects
 */
export function renderProjectList(projects) {
  const container = document.getElementById('project-list-container');

  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state">No projects yet. Create one to get started.</div>';
    return;
  }

  const rows = projects.map(p => `
    <tr class="project-row" data-id="${p.id}" title="Open project">
      <td class="project-col-name">${escHtml(p.name)}</td>
      <td class="project-col-date">${formatDate(new Date(p.created_at))}</td>
      <td class="project-col-date">${p.last_fetch_at ? formatDate(new Date(p.last_fetch_at)) : '<span class="muted-text">Never</span>'}</td>
      <td class="project-col-count">${p.source_count}</td>
      <td class="project-col-count">${p.file_count}</td>
      <td class="project-col-actions" onclick="event.stopPropagation()">
        <button class="btn btn-sm btn-danger btn-delete-project" data-id="${p.id}" data-name="${escHtml(p.name)}">Delete</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="project-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Created</th>
          <th>Last Fetch</th>
          <th>Sources</th>
          <th>Files</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Bind row click → enter project
  container.querySelectorAll('.project-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      const project = projects.find(p => p.id === id);
      if (project && onProjectSelect) onProjectSelect(project);
    });
  });

  // Bind delete buttons
  container.querySelectorAll('.btn-delete-project').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const name = btn.dataset.name;
      if (!confirm(`Delete project "${name}"? This removes all its sources, files, and tags.`)) return;
      try {
        await apiDeleteProject(id);
        // Remove row from current list and re-render
        const updated = projects.filter(p => p.id !== id);
        renderProjectList(updated);
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    });
  });
}

/** Bind the New Project button + inline creation flow */
export function bindNewProjectButton(onCreated) {
  document.getElementById('btn-new-project').addEventListener('click', () => {
    showNewProjectForm(onCreated);
  });
}

function showNewProjectForm(onCreated) {
  const container = document.getElementById('project-list-container');
  const formHtml = `
    <div id="new-project-form" class="new-project-form">
      <input id="new-project-name" type="text" class="input-control" placeholder="Project name…" autofocus />
      <button id="btn-create-project" class="btn btn-primary">Create</button>
      <button id="btn-cancel-new-project" class="btn btn-secondary">Cancel</button>
      <span id="new-project-error" class="form-error hidden"></span>
    </div>
  `;
  // Prepend form above the table (or empty state)
  container.insertAdjacentHTML('afterbegin', formHtml);

  const nameInput = document.getElementById('new-project-name');
  nameInput.focus();

  const doCreate = async () => {
    const name = nameInput.value.trim();
    const errEl = document.getElementById('new-project-error');
    if (!name) { errEl.textContent = 'Name required'; errEl.classList.remove('hidden'); return; }
    try {
      const project = await apiCreateProject(name);
      document.getElementById('new-project-form').remove();
      onCreated(project);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  };

  document.getElementById('btn-create-project').addEventListener('click', doCreate);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });
  document.getElementById('btn-cancel-new-project').addEventListener('click', () => {
    document.getElementById('new-project-form').remove();
  });
}
