// API wrappers for project-scoped blacklist rules.

export async function apiGetBlacklistRules(projectId, signal) {
  const res = await fetch(`/api/blacklist-rules?project_id=${projectId}`, { signal });
  const data = await res.json().catch(() => ([]));
  if (!res.ok) throw new Error(data.error || 'Failed to load blacklist rules');
  return data;
}

export async function apiCreateBlacklistRule(projectId, ruleType, value) {
  const res = await fetch('/api/blacklist-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId, rule_type: ruleType, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create blacklist rule');
  return data;
}

export async function apiDeleteBlacklistRule(id, projectId) {
  const res = await fetch(`/api/blacklist-rules/${id}?project_id=${projectId}`, {
    method: 'DELETE',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete blacklist rule');
}
