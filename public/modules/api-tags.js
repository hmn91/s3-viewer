// API wrapper functions for tag endpoints
// fileKey must be base64-encoded before sending in URL (contains :: and / chars)

function encodeFileKey(fileKey) {
  return btoa(fileKey);
}

export async function apiGetTags(projectId) {
  const url = projectId ? `/api/tags?project_id=${projectId}` : '/api/tags';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load tags');
  return res.json();
}

export async function apiCreateTag(name, color, projectId) {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color, project_id: projectId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create tag');
  return data;
}

export async function apiUpdateTag(id, name, color) {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to update tag');
  return data;
}

export async function apiDeleteTag(id) {
  const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to delete tag');
  }
}

export async function apiAssignTag(fileKey, tagId, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tagId, project_id: projectId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to assign tag');
  }
}

export async function apiRemoveTag(fileKey, tagId, projectId) {
  const encoded = encodeFileKey(fileKey);
  const res = await fetch(`/api/files/${encoded}/tags/${tagId}?project_id=${projectId}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to remove tag');
  }
}
