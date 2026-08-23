// Pure blacklist matching helpers. S3 listing XML does not include MIME type,
// so file-type rules are matched as filename extensions.

function filePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url).split(/[?#]/, 1)[0];
  }
}

export function matchesBlacklistRule(file, rule) {
  const url = String(file.url || '');
  const value = String(rule.value || '');
  if (!url || !value) return false;

  if (rule.rule_type === 'file_type') {
    return filePath(url).toLowerCase().endsWith(value.toLowerCase());
  }
  if (rule.rule_type === 'url_prefix') return url.startsWith(value);
  if (rule.rule_type === 'url_suffix') return url.endsWith(value);
  return false;
}

export function findBlacklistRule(file, rules) {
  return rules.find(rule => matchesBlacklistRule(file, rule)) || null;
}
