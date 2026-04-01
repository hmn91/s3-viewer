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

// Fetch S3 listing with pagination support (appends continuation-token for subsequent pages)
export async function apiProxyFetchPaginated(baseUrl, continuationToken) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  const url = continuationToken
    ? `${baseUrl}${sep}continuation-token=${encodeURIComponent(continuationToken)}`
    : baseUrl;
  return apiProxyFetch(url);
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

// URL-safe base64 encode for file keys in URL params
function encodeFileKey(fileKey) {
  return btoa(fileKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function apiUpdateComment(fileKey, comment, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/comment`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment, project_id: projectId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to update comment');
  }
}

export async function apiGetHiddenKeys(projectId) {
  const res = await fetch(`/api/hidden?project_id=${projectId}`);
  if (!res.ok) throw new Error('Failed to load hidden files');
  return res.json(); // string[]
}

export async function apiHideFile(fileKey, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/hide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to hide file');
  }
}

export async function apiUnhideFile(fileKey, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/hide?project_id=${projectId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to unhide file');
  }
}
