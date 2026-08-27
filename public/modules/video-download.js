const POLL_INTERVAL_MS = 500;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const secs = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function createProgressCard(filename) {
  const card = document.createElement('div');
  card.className = 'download-progress-card indeterminate';
  card.innerHTML = `
    <div class="download-progress-header">
      <span class="download-progress-name"></span>
      <span class="download-progress-percent">Preparing...</span>
    </div>
    <div class="download-progress-track" aria-hidden="true">
      <div class="download-progress-fill"></div>
    </div>
    <div class="download-progress-detail">Starting FFmpeg...</div>
  `;
  card.querySelector('.download-progress-name').textContent = filename;
  document.getElementById('download-progress-list').appendChild(card);
  return card;
}

function updateProgressCard(card, job) {
  const hasPercent = Number.isFinite(job.percent);
  card.classList.toggle('indeterminate', !hasPercent);
  if (hasPercent) {
    card.querySelector('.download-progress-fill').style.width = `${job.percent}%`;
    card.querySelector('.download-progress-percent').textContent = `${job.percent}%`;
  }

  const processed = formatDuration(job.processedSeconds);
  const duration = job.durationSeconds ? ` / ${formatDuration(job.durationSeconds)}` : '';
  const speed = job.speed ? ` · ${job.speed}` : '';
  card.querySelector('.download-progress-detail').textContent =
    `FFmpeg: ${processed}${duration}${speed}`;
}

function startBrowserDownload(job) {
  const link = document.createElement('a');
  link.href = job.downloadUrl;
  link.download = job.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function runVideoDownload(button) {
  if (button.classList.contains('is-processing')) return;
  button.classList.add('is-processing');
  button.setAttribute('aria-disabled', 'true');
  const card = createProgressCard(button.dataset.downloadFilename || 'video.mp4');

  try {
    let job = await responseJson(await fetch(button.dataset.prepareUrl, { method: 'POST' }));
    while (job.status === 'processing') {
      updateProgressCard(card, job);
      await wait(POLL_INTERVAL_MS);
      job = await responseJson(await fetch(`/api/download-video-jobs/${job.id}`));
    }

    if (job.status !== 'complete') throw new Error(job.error || 'FFmpeg failed');
    updateProgressCard(card, job);
    card.classList.remove('indeterminate');
    card.classList.add('complete');
    card.querySelector('.download-progress-percent').textContent = '100%';
    card.querySelector('.download-progress-detail').textContent = 'Ready — starting download...';
    startBrowserDownload(job);
    setTimeout(() => card.remove(), 5000);
  } catch (err) {
    card.classList.remove('indeterminate');
    card.classList.add('failed');
    card.querySelector('.download-progress-percent').textContent = 'Failed';
    card.querySelector('.download-progress-detail').textContent = err.message;
  } finally {
    button.classList.remove('is-processing');
    button.removeAttribute('aria-disabled');
  }
}

export function bindVideoDownloads() {
  document.getElementById('main-content').addEventListener('click', event => {
    const button = event.target.closest('.btn-download-mp4[data-prepare-url]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    runVideoDownload(button);
  });
}
