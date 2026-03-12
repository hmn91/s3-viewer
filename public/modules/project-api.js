// API wrapper functions for project endpoints

export async function apiGetProjects() {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}

export async function apiCreateProject(name) {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create project');
  return data;
}

export async function apiUpdateProject(id, name) {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update project');
  return data;
}

export async function apiDeleteProject(id) {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete project');
  }
}

export async function apiUpdateLastFetch(id) {
  const res = await fetch(`/api/projects/${id}/last-fetch`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Failed to update last fetch');
  return res.json();
}

export async function apiSearch(q, type = 'all') {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`);
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
