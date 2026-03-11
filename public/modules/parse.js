// S3 XML parsing utilities + DB row → file object conversion

import { isNewFile } from './sort-filter.js';

const S3_NS = 'http://s3.amazonaws.com/doc/2006-03-01/';

// Namespace-aware element getter with fallback for servers without ns
function getEl(parent, tag) {
  return parent.getElementsByTagNameNS(S3_NS, tag)[0]
    || parent.getElementsByTagName(tag)[0]
    || null;
}

// Strip leading timestamp prefix: "1771825543440-filename.pdf" → "filename.pdf"
export function extractDisplayName(key) {
  const filename = key.split('/').pop();
  return filename.replace(/^\d+-/, '');
}

// Convert a DB row from /api/files into a file object
// seen_files.key format is "sourceUrl::s3Key" — extract just the s3Key part
export function dbRowToFile(row) {
  const colonIdx = row.key.indexOf('::');
  const s3Key = colonIdx !== -1 ? row.key.substring(colonIdx + 2) : row.key;
  return {
    key: row.key,
    displayName: extractDisplayName(s3Key),
    folder: s3Key.includes('/') ? s3Key.substring(0, s3Key.lastIndexOf('/')) : '',
    url: row.source_url + s3Key,
    sourceUrl: row.source_url,
    sourceLabel: row.source_label || '(deleted source)',
    sourceId: row.source_id,
    size: row.size || 0,
    lastModified: row.last_modified ? new Date(row.last_modified) : null,
    firstSeen: row.first_seen,
    isNew: isNewFile(row.first_seen),
    tags: row.tags || [],
  };
}

export function parseS3Xml(xmlText, source) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) throw new Error('Invalid XML: ' + parseErr.textContent.slice(0, 120));

  const isTruncated = getEl(doc, 'IsTruncated')?.textContent === 'true';
  if (isTruncated) console.warn(`[${source.label}] Results truncated at 1000 files`);

  // Get Contents elements — handle both namespaced and non-namespaced
  const nsContents = [...doc.getElementsByTagNameNS(S3_NS, 'Contents')];
  const noNsContents = [...doc.getElementsByTagName('Contents')].filter(
    el => el.namespaceURI !== S3_NS
  );
  const contents = nsContents.length ? nsContents : noNsContents;

  const files = contents.map(el => {
    const key = getEl(el, 'Key')?.textContent || '';
    const sizeText = getEl(el, 'Size')?.textContent || '0';
    const lastModText = getEl(el, 'LastModified')?.textContent || '';
    return {
      key,
      displayName: extractDisplayName(key),
      folder: key.includes('/') ? key.substring(0, key.lastIndexOf('/')) : '',
      url: source.url + key,
      sourceUrl: source.url,
      sourceLabel: source.label,
      sourceId: source.id,
      size: parseInt(sizeText, 10),
      lastModified: lastModText ? new Date(lastModText) : null,
      firstSeen: null,
      isNew: false,
    };
  });

  return { files, truncated: isTruncated };
}
