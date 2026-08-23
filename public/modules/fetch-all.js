// Main fetch flow: load sources, fetch S3 XML, parse, detect new files, render

import { state } from './state.js';
import {
  apiAllowFetchBeyondLimit,
  apiBatchHideFiles,
  apiFetchSources,
  apiProxyFetchPaginated,
  apiGetSeen,
  apiSaveSeen,
} from './api.js';
import { apiGetBlacklistRules } from './api-blacklist.js';
import { apiUpdateLastFetch } from './project-api.js';
import { parseS3Xml } from './parse.js';
import { isNewFile } from './sort-filter.js';
import { renderFileList, renderStats, renderSourceDropdown, renderTagFilter } from './render-ui.js';
import { escHtml, formatDate } from './utils.js';
import { findBlacklistRule } from './blacklist-match.js';
import { updateHiddenButton } from './hidden-ui.js';

const PAGE_WARNING_THRESHOLD = 100;
let activeRun = null;

function isAbortError(err) {
  return err?.name === 'AbortError';
}

function updateProgress(run, status) {
  const progress = document.getElementById('fetch-progress');
  progress.classList.remove('hidden', 'complete', 'stopped', 'failed');
  const prefix = status || (run.stopped ? 'Stopping' : 'Fetching');
  document.getElementById('fetch-progress-label').textContent =
    `${prefix}: ${run.objects.toLocaleString()} objects | ${run.pages.toLocaleString()} pages | ` +
    `${run.completedSources}/${run.sourceCount} sources completed`;
}

function finishProgress(run, outcome) {
  const progress = document.getElementById('fetch-progress');
  progress.classList.remove('hidden', 'complete', 'stopped', 'failed');
  progress.classList.add(outcome);

  const stoppedSources = run.stoppedSourceLabels.length
    ? ` | ${run.stoppedSourceLabels.length} large source(s) stopped at the warning`
    : '';
  const autoHidden = run.autoHidden
    ? ` | ${run.autoHidden.toLocaleString()} blacklisted object(s) hidden`
    : '';
  const prefix = outcome === 'stopped' ? 'Stopped' : outcome === 'failed' ? 'Failed' : 'Done';
  document.getElementById('fetch-progress-label').textContent =
    `${prefix}: kept ${run.objects.toLocaleString()} objects from ${run.pages.toLocaleString()} pages` +
    stoppedSources + autoHidden;
}

function showFetchMessages(run) {
  const messages = Object.entries(state.fetchErrors).map(([url, msg]) =>
    `<b>${escHtml(url)}</b>: ${escHtml(msg)}`
  );
  for (const item of run.stoppedSourceLabels) {
    messages.push(`<b>${escHtml(item.label)}</b>: stopped after ${item.pages} pages ` +
      `(${item.objects.toLocaleString()} objects kept).`);
  }

  const banner = document.getElementById('error-banner');
  if (messages.length === 0) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  banner.innerHTML = messages.join('<br>');
  banner.classList.remove('hidden');
}

function hideFetchLimitModal() {
  document.getElementById('fetch-limit-modal').classList.add('hidden');
}

function showFetchLimitPrompt(run, source, pageCount, objectCount) {
  return new Promise(resolve => {
    const modal = document.getElementById('fetch-limit-modal');
    const stopAllBtn = document.getElementById('btn-stop-all-from-limit');
    const stopBtn = document.getElementById('btn-stop-large-source');
    const continueBtn = document.getElementById('btn-continue-large-source');

    document.getElementById('fetch-limit-source-label').textContent = source.label;
    document.getElementById('fetch-limit-details').textContent =
      `${pageCount.toLocaleString()} pages and ${objectCount.toLocaleString()} objects have been fetched from ${source.url}`;
    modal.classList.remove('hidden');

    const settle = shouldContinue => {
      if (run.resolveLimitPrompt !== settle) return;
      run.resolveLimitPrompt = null;
      stopAllBtn.onclick = null;
      stopBtn.onclick = null;
      continueBtn.onclick = null;
      hideFetchLimitModal();
      resolve(shouldContinue);
    };

    run.resolveLimitPrompt = settle;
    stopAllBtn.onclick = stopFetch;
    stopBtn.onclick = () => settle(false);
    continueBtn.onclick = () => settle(true);
    continueBtn.focus();
  });
}

// Multiple sources fetch concurrently. Serialize threshold prompts so modals cannot overlap.
function queueFetchLimitPrompt(run, source, pageCount, objectCount) {
  const decision = run.promptQueue.then(() => {
    if (run.stopped) return false;
    return showFetchLimitPrompt(run, source, pageCount, objectCount);
  });
  run.promptQueue = decision.then(() => undefined, () => undefined);
  return decision;
}

export function stopFetch() {
  if (!activeRun || activeRun.stopped) return;
  activeRun.stopped = true;
  activeRun.controller.abort();
  if (activeRun.resolveLimitPrompt) activeRun.resolveLimitPrompt(false);
  updateProgress(activeRun, 'Stopping; processing fetched data');
}

export async function fetchAll() {
  if (activeRun) return;

  const btn = document.getElementById('btn-fetch-all');
  const stopBtn = document.getElementById('btn-stop-fetch');
  const backBtn = document.getElementById('btn-back-to-projects');
  const run = {
    controller: new AbortController(),
    stopped: false,
    pages: 0,
    objects: 0,
    completedSources: 0,
    sourceCount: 0,
    stoppedSourceLabels: [],
    autoHidden: 0,
    promptQueue: Promise.resolve(),
    resolveLimitPrompt: null,
    originalButtonText: btn.textContent,
  };
  activeRun = run;

  btn.disabled = true;
  backBtn.disabled = true;
  btn.textContent = 'Fetching...';
  stopBtn.classList.remove('hidden');
  document.getElementById('error-banner').classList.add('hidden');
  state.fetchErrors = {};
  updateProgress(run, 'Preparing');

  const projectId = state.currentProject?.id;
  let outcome = 'complete';

  try {
    // 1. Load latest sources + seen map in parallel (scoped to current project)
    const [sources, seenMap, blacklistRules] = await Promise.all([
      apiFetchSources(projectId, run.controller.signal),
      apiGetSeen(projectId, run.controller.signal),
      apiGetBlacklistRules(projectId, run.controller.signal),
    ]);
    state.sources = sources;
    state.seenMap = seenMap;
    state.blacklistRules = blacklistRules;
    run.sourceCount = sources.length;
    updateProgress(run);

    if (sources.length === 0) {
      document.getElementById('main-content').innerHTML =
        '<div class="empty-state">No sources configured. Add sources via Manage Sources.</div>';
      return;
    }

    // 2. Fetch all S3 listings concurrently. A failure in one source does not block others.
    const allFiles = [];
    const nowIso = new Date().toISOString();

    const results = await Promise.allSettled(
      sources.map(async source => {
        let paginationParams = {};
        let pageCount = 0;
        let sourceObjectCount = 0;
        const seenCursors = new Set();

        try {
          while (!run.stopped) {
            const xml = await apiProxyFetchPaginated(
              source.url,
              paginationParams,
              run.controller.signal,
            );
            if (run.stopped) break;

            const { files, truncated, nextToken, nextMarker, isV2 } = parseS3Xml(xml, source);
            allFiles.push(...files);
            pageCount++;
            sourceObjectCount += files.length;
            run.pages++;
            run.objects += files.length;
            updateProgress(run);

            if (!truncated) break;

            const nextParams = isV2 && nextToken
              ? { continuationToken: nextToken }
              : nextMarker ? { marker: nextMarker } : null;
            if (!nextParams) {
              throw new Error('S3 says the listing is truncated but did not provide a next-page token');
            }

            const cursor = nextParams.continuationToken
              ? `v2:${nextParams.continuationToken}`
              : `v1:${nextParams.marker}`;
            if (seenCursors.has(cursor)) {
              throw new Error('S3 returned a repeated pagination token; fetch stopped to avoid an infinite loop');
            }
            seenCursors.add(cursor);

            // Pause before page 101 unless this source was previously approved.
            if (pageCount >= PAGE_WARNING_THRESHOLD && !Number(source.allow_fetch_beyond_100)) {
              updateProgress(run, `Waiting for a decision on ${source.label}`);
              const shouldContinue = await queueFetchLimitPrompt(
                run,
                source,
                pageCount,
                sourceObjectCount,
              );
              if (!shouldContinue || run.stopped) {
                if (!run.stopped) {
                  run.stoppedSourceLabels.push({
                    label: source.label,
                    pages: pageCount,
                    objects: sourceObjectCount,
                  });
                }
                break;
              }

              // Persist before continuing so the choice survives reloads/restarts.
              const updatedSource = await apiAllowFetchBeyondLimit(source.id);
              Object.assign(source, updatedSource);
              updateProgress(run);
            }

            paginationParams = nextParams;
          }
        } finally {
          run.completedSources++;
          updateProgress(run);
        }
      })
    );

    // 3. Collect real errors; AbortError is expected after the user presses Stop.
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const err = results[i].reason;
        if (run.stopped && isAbortError(err)) continue;
        const label = sources[i]?.url || 'unknown';
        state.fetchErrors[label] = err?.message || 'Unknown error';
        console.error(`Fetch failed [${label}]:`, err?.message);
      }
    }

    // 4. Enrich fetched objects with persisted first-seen time, tags and comments.
    updateProgress(run, run.stopped ? 'Stopped; processing fetched data' : 'Processing fetched data');
    const newFileEntries = [];
    const blacklistedKeys = new Set();
    for (const f of allFiles) {
      const seenKey = `${f.sourceUrl}::${f.key}`;
      f.key = seenKey;
      const seen = seenMap[seenKey];
      if (seen) {
        f.firstSeen = seen.firstSeen;
        f.tags = seen.tags || [];
        f.comment = seen.comment || '';
      } else {
        f.firstSeen = nowIso;
        f.tags = [];
        f.comment = '';
        newFileEntries.push({
          key: seenKey,
          sourceUrl: f.sourceUrl,
          firstSeen: nowIso,
          size: f.size,
          lastModified: f.lastModified?.toISOString() || null,
        });
      }
      f.isNew = isNewFile(f.firstSeen);
      if (findBlacklistRule(f, blacklistRules)) blacklistedKeys.add(f.key);
      f.isHidden = state.hiddenKeys.has(f.key);
    }

    // 5. Persist every newly discovered object, including objects fetched before Stop.
    if (newFileEntries.length > 0) {
      updateProgress(run, run.stopped ? 'Stopped; saving fetched data' : 'Saving fetched data');
      await apiSaveSeen(newFileEntries, projectId);
    }

    // Persist automatic hides as a batch, then reflect them in UI state.
    if (blacklistedKeys.size > 0) {
      updateProgress(run, `Auto-hiding ${blacklistedKeys.size.toLocaleString()} blacklisted objects`);
      try {
        await apiBatchHideFiles([...blacklistedKeys], projectId);
        run.autoHidden = blacklistedKeys.size;
        for (const key of blacklistedKeys) state.hiddenKeys.add(key);
        for (const file of allFiles) {
          if (blacklistedKeys.has(file.key)) file.isHidden = true;
        }
      } catch (err) {
        state.fetchErrors.Blacklist = err?.message || 'Failed to hide blacklisted files';
      }
    }

    state.allFiles = allFiles;
    state.activeSourceIds = new Set(sources.map(s => s.id));
    state.activeTagIds = new Set(state.tags.map(t => t.id));
    state.filterNoTag = true;
    updateHiddenButton();

    // 6. Render partial or complete results through the same normal flow.
    renderFileList();
    renderStats();
    renderSourceDropdown();
    renderTagFilter();
    showFetchMessages(run);

    // 7. Record when this fetch run (complete or user-stopped) was processed.
    const now = formatDate(new Date());
    const lsKey = projectId ? `lastFetch_${projectId}` : 'lastFetch';
    localStorage.setItem(lsKey, now);
    document.getElementById('last-fetch-label').textContent = `Last fetch: ${now}`;
    if (projectId) apiUpdateLastFetch(projectId).catch(() => {});

    outcome = run.stopped ? 'stopped' : 'complete';
  } catch (err) {
    if (run.stopped && isAbortError(err)) {
      outcome = 'stopped';
    } else {
      outcome = 'failed';
      state.fetchErrors.Fetch = err?.message || 'Unknown error';
      showFetchMessages(run);
      console.error('Fetch failed:', err);
    }
  } finally {
    if (run.resolveLimitPrompt) run.resolveLimitPrompt(false);
    hideFetchLimitModal();
    finishProgress(run, outcome);
    btn.disabled = false;
    backBtn.disabled = false;
    btn.textContent = run.originalButtonText;
    stopBtn.classList.add('hidden');
    activeRun = null;
  }
}
