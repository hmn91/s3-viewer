// API wrapper functions for all backend endpoints

export async function apiFetchSources(projectId) {
  const url = projectId ? `/api/sources?project_id=${projectId}` : '/api/sources';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load sources');
  return res.json();
}

export async function apiAddSource(label, url, projectId) {
  const res = await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, url, project_id: projectId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to add source');
  return data;
}

export async function apiUpdateSource(id, label, url) {
  const res = await fetch(`/api/sources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, url }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update source');
  return data;
}

export async function apiDeleteSource(id) {
  const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete source');
  }
}

export async function apiProxyFetch(url) {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.text();
}

export async function apiGetFiles(projectId) {
  const url = projectId ? `/api/files?project_id=${projectId}` : '/api/files';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load files');
  return res.json();
}

export async function apiGetSeen(projectId) {
  // seen map is used for fetch-all dedup; we filter by project via the sources already loaded
  const url = projectId ? `/api/seen?project_id=${projectId}` : '/api/seen';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load seen files');
  return res.json();
}

export async function apiSaveSeen(files, projectId) {
  const res = await fetch('/api/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, project_id: projectId }),
  });
  if (!res.ok) throw new Error('Failed to save seen files');
  return res.json();
}
