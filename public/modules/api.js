// API wrapper functions for all backend endpoints

export async function apiFetchSources(projectId, signal) {
  const url = projectId ? `/api/sources?project_id=${projectId}` : '/api/sources';
  const res = await fetch(url, { signal });
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

export async function apiAllowFetchBeyondLimit(id) {
  const res = await fetch(`/api/sources/${id}/fetch-limit`, { method: 'PATCH' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to save fetch-limit preference');
  return data;
}

export async function apiProxyFetch(url, signal) {
  const res = await fetch(`/api/fetch?url=${encodeURIComponent(url)}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.text();
}

// Fetch S3 listing with pagination (supports both v1 marker and v2 continuation-token)
export async function apiProxyFetchPaginated(baseUrl, { continuationToken, marker } = {}, signal) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  let url = baseUrl;
  if (continuationToken) {
    url += `${sep}continuation-token=${encodeURIComponent(continuationToken)}`;
  } else if (marker) {
    url += `${sep}marker=${encodeURIComponent(marker)}`;
  }
  return apiProxyFetch(url, signal);
}

export async function apiGetFiles(projectId, options = {}, signal) {
  const params = new URLSearchParams({
    project_id: projectId,
    page: options.page ?? 1,
    limit: options.limit ?? 50,
    show_hidden: Boolean(options.showHidden),
    negative_search: Boolean(options.negativeSearch),
    include_no_tag: Boolean(options.includeNoTag),
    new_only: Boolean(options.newOnly),
  });
  if (options.search) params.set('search', options.search);
  if (options.sourceIds !== null && options.sourceIds !== undefined) {
    params.set('source_ids', options.sourceIds.join(','));
  }
  if (options.tagIds !== null && options.tagIds !== undefined) {
    params.set('tag_ids', options.tagIds.join(','));
  }
  if (options.sortCol && options.sortDir) {
    params.set('sort_col', options.sortCol);
    params.set('sort_dir', options.sortDir);
  }

  const res = await fetch(`/api/files?${params}`, { signal });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to load files');
  }
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

export async function apiBatchHideFiles(fileKeys, projectId) {
  const res = await fetch('/api/hidden/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_keys: fileKeys, project_id: projectId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to hide blacklisted files');
  return data;
}

export async function apiUnhideFile(fileKey, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/hide?project_id=${projectId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to unhide file');
  }
}
