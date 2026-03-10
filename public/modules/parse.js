// S3 XML parsing utilities

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
