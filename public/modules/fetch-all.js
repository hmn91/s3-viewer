// Main fetch flow: load sources, fetch S3 XML, parse, detect new files, render

import { state } from './state.js';
import { apiFetchSources, apiProxyFetch, apiGetSeen, apiSaveSeen } from './api.js';
import { apiUpdateLastFetch } from './project-api.js';
import { parseS3Xml } from './parse.js';
import { isNewFile } from './sort-filter.js';
import { renderFileList, renderStats, renderSourceDropdown, renderTagFilter } from './render-ui.js';
import { escHtml, formatDate } from './utils.js';

export async function fetchAll() {
  const btn = document.getElementById('btn-fetch-all');
  btn.disabled = true;
  btn.textContent = '⏳ Fetching…';
  document.getElementById('error-banner').classList.add('hidden');
  state.fetchErrors = {};

  const projectId = state.currentProject?.id;

  try {
    // 1. Load latest sources + seen map in parallel (scoped to current project)
    const [sources, seenMap] = await Promise.all([apiFetchSources(projectId), apiGetSeen(projectId)]);
    state.sources = sources;
    state.seenMap = seenMap;

    if (sources.length === 0) {
      document.getElementById('main-content').innerHTML =
        '<div class="empty-state">No sources configured. Add sources via ⚙ Manage Sources.</div>';
      return;
    }

    // 2. Fetch all S3 XMLs in parallel (allSettled — one failure won't block others)
    // Attach sourceUrl to rejection so error attribution works per-source
    const results = await Promise.allSettled(
      sources.map(s =>
        apiProxyFetch(s.url)
          .then(xml => ({ source: s, xml }))
          .catch(err => Promise.reject(Object.assign(err, { sourceUrl: s.url })))
      )
    );

    // 3. Parse results, collect all files
    const allFiles = [];
    const nowIso = new Date().toISOString();

    for (const result of results) {
      if (result.status === 'rejected') {
        const err = result.reason;
        const label = err?.sourceUrl || 'unknown';
        state.fetchErrors[label] = err?.message || 'Unknown error';
        console.error(`Fetch failed [${label}]:`, err?.message);
        continue;
      }
      const { source, xml } = result.value;
      try {
        const { files, truncated } = parseS3Xml(xml, source);
        if (truncated) {
          state.fetchErrors[source.url] = 'Results truncated (>1000 files)';
        }
        allFiles.push(...files);
      } catch (err) {
        state.fetchErrors[source.url] = 'Parse error: ' + err.message;
      }
    }

    // 4. Set firstSeen from seenMap (or now if new), compute isNew from 24h window
    // Use composite key (sourceUrl::s3Key) as canonical file identifier so tag assignments match DB
    const newFileEntries = [];
    for (const f of allFiles) {
      const seenKey = `${f.sourceUrl}::${f.key}`;
      f.key = seenKey; // promote to composite key — must match seen_files.key in DB
      if (seenMap[seenKey]) {
        f.firstSeen = seenMap[seenKey].firstSeen;
      } else {
        f.firstSeen = nowIso;
        newFileEntries.push({
          key: seenKey,
          sourceUrl: f.sourceUrl,
          firstSeen: nowIso,
          size: f.size,
          lastModified: f.lastModified?.toISOString() || null,
        });
      }
      f.isNew = isNewFile(f.firstSeen);
      f.tags = f.tags || [];
    }

    // 5. Persist newly discovered files (scoped to current project)
    if (newFileEntries.length > 0) {
      await apiSaveSeen(newFileEntries, projectId);
    }

    state.allFiles = allFiles;
    // Init filter: all sources visible
    state.activeSourceIds = new Set(sources.map(s => s.id));

    // 6. Render
    renderFileList();
    renderStats();
    renderSourceDropdown();
    renderTagFilter();

    // 7. Show per-source errors if any
    const errorEntries = Object.entries(state.fetchErrors);
    if (errorEntries.length > 0) {
      const banner = document.getElementById('error-banner');
      banner.innerHTML = errorEntries.map(([url, msg]) =>
        `⚠ <b>${escHtml(url)}</b>: ${escHtml(msg)}`
      ).join('<br>');
      banner.classList.remove('hidden');
    }

    // 8. Update last fetch timestamp in DB (per project) and localStorage (per project key)
    const now = formatDate(new Date());
    const lsKey = projectId ? `lastFetch_${projectId}` : 'lastFetch';
    localStorage.setItem(lsKey, now);
    document.getElementById('last-fetch-label').textContent = `Last fetch: ${now}`;
    if (projectId) {
      apiUpdateLastFetch(projectId).catch(() => {}); // fire-and-forget, non-critical
    }

  } finally {
    btn.disabled = false;
    btn.textContent = '⬇ Fetch All';
  }
}
