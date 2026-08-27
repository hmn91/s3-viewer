// File download routes: stream original URLs or remux HLS (.m3u8) streams to MP4.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';

const MAX_FILENAME_LENGTH = 180;
const MAX_FFMPEG_ERROR_LENGTH = 16_000;
const REMOTE_HEADER_TIMEOUT_MS = 30_000;
const DOWNLOAD_JOB_TTL_MS = 10 * 60_000;
const FAILED_JOB_TTL_MS = 60_000;

export function parseDownloadUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('url param required');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs allowed');
  }
  return parsed;
}

export function parseEncodedDownloadUrl(value) {
  if (typeof value !== 'string' || !value) throw new Error('source param required');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return parseDownloadUrl(Buffer.from(padded, 'base64').toString('utf8'));
}

export function sanitizeDownloadFilename(value, fallback = 'download') {
  const sanitized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  return sanitized || fallback;
}

function filenameFromUrl(url) {
  const rawName = url.pathname.split('/').pop();
  if (!rawName) return 'download';
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

export function mp4Filename(value) {
  const filename = sanitizeDownloadFilename(value, 'video.m3u8');
  return filename.replace(/\.(?:m3u8|mp4)$/i, '') + '.mp4';
}

function requestedFilename(req, targetUrl) {
  const requested = typeof req.query.filename === 'string' ? req.query.filename : '';
  return sanitizeDownloadFilename(requested || filenameFromUrl(targetUrl));
}

function sendRouteError(res, status, message) {
  if (!res.headersSent) res.status(status).json({ error: message });
  else if (!res.destroyed) res.destroy();
}

function durationFromFfmpegOutput(output) {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function publicJobStatus(job) {
  return {
    id: job.id,
    status: job.status,
    filename: job.filename,
    durationSeconds: job.durationSeconds,
    processedSeconds: job.processedSeconds,
    percent: job.status === 'complete' ? 100 : job.percent,
    speed: job.speed,
    error: job.error,
    downloadUrl: job.status === 'complete'
      ? `/api/download-video-jobs/${job.id}/file`
      : null,
  };
}

export function createDownloadsRouter() {
  const router = Router();
  const videoJobs = new Map();

  async function removeVideoJob(job) {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    if (job.ffmpeg?.exitCode === null && !job.ffmpeg.killed) job.ffmpeg.kill();
    videoJobs.delete(job.id);
    await rm(job.outputPath, { force: true }).catch(() => {});
  }

  function scheduleJobCleanup(job, delay) {
    if (job.cleanupTimer) clearTimeout(job.cleanupTimer);
    job.cleanupTimer = setTimeout(() => removeVideoJob(job), delay);
    job.cleanupTimer.unref?.();
  }

  function startVideoJob(targetUrl, filename) {
    const id = randomUUID();
    const job = {
      id,
      filename,
      outputPath: join(tmpdir(), `s3-viewer-${id}.mp4`),
      status: 'processing',
      durationSeconds: null,
      processedSeconds: 0,
      percent: null,
      speed: null,
      error: null,
      ffmpegError: '',
      progressBuffer: '',
      ffmpeg: null,
      cleanupTimer: null,
      resolveCompletion: null,
    };
    job.completion = new Promise(resolve => {
      job.resolveCompletion = resolve;
    });
    videoJobs.set(id, job);

    const args = [
      '-y',
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'info',
      '-stats_period', '0.5',
      '-i', targetUrl.toString(),
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', '+faststart',
      '-progress', 'pipe:3',
      job.outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
    });
    job.ffmpeg = ffmpeg;
    let spawnFailed = false;

    ffmpeg.stderr.on('data', chunk => {
      if (job.ffmpegError.length < MAX_FFMPEG_ERROR_LENGTH) {
        job.ffmpegError += chunk.toString();
      }
      if (job.durationSeconds === null) {
        job.durationSeconds = durationFromFfmpegOutput(job.ffmpegError);
      }
    });

    ffmpeg.stdio[3].on('data', chunk => {
      job.progressBuffer += chunk.toString();
      const lines = job.progressBuffer.split(/\r?\n/);
      job.progressBuffer = lines.pop() || '';
      for (const line of lines) {
        const separator = line.indexOf('=');
        if (separator < 0) continue;
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (key === 'out_time_us') {
          job.processedSeconds = Math.max(0, Number(value) / 1_000_000 || 0);
          if (job.durationSeconds) {
            job.percent = Math.min(99, Math.max(0,
              Math.round(job.processedSeconds / job.durationSeconds * 100)));
          }
        } else if (key === 'speed') {
          job.speed = value === 'N/A' ? null : value;
        }
      }
    });

    ffmpeg.once('error', err => {
      spawnFailed = true;
      job.status = 'failed';
      job.error = err.code === 'ENOENT'
        ? 'FFmpeg is not installed or is not available in PATH'
        : `Could not start FFmpeg: ${err.message}`;
      job.resolveCompletion();
      scheduleJobCleanup(job, FAILED_JOB_TTL_MS);
    });

    ffmpeg.once('close', code => {
      if (spawnFailed) return;
      if (code === 0) {
        job.status = 'complete';
        job.percent = 100;
        scheduleJobCleanup(job, DOWNLOAD_JOB_TTL_MS);
      } else {
        job.status = 'failed';
        const detail = job.ffmpegError.trim().slice(-MAX_FFMPEG_ERROR_LENGTH)
          || `FFmpeg exited with code ${code}`;
        job.error = `M3U8 conversion failed: ${detail}`;
        console.error(`M3U8 download failed: ${detail}`);
        scheduleJobCleanup(job, FAILED_JOB_TTL_MS);
      }
      job.resolveCompletion();
    });

    return job;
  }

  function videoRequestDetails(req) {
    const targetUrl = req.query.source
      ? parseEncodedDownloadUrl(req.query.source)
      : parseDownloadUrl(req.query.url);
    return {
      targetUrl,
      outputName: mp4Filename(requestedFilename(req, targetUrl)),
    };
  }

  function sendCompletedJob(job, res) {
    res.download(job.outputPath, job.filename, err => {
      removeVideoJob(job);
      if (err && !res.headersSent) sendRouteError(res, 500, err.message);
    });
  }

  // Stream a remote file through the server so cross-origin URLs download reliably.
  router.get('/download', async (req, res) => {
    let targetUrl;
    try {
      targetUrl = parseDownloadUrl(req.query.url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const controller = new AbortController();
    const headerTimeout = setTimeout(() => controller.abort(), REMOTE_HEADER_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const response = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(headerTimeout);
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return res.status(502).json({ error: `Remote server returned HTTP ${response.status}` });
      }

      res.attachment(requestedFilename(req, targetUrl));
      const contentType = response.headers.get('content-type');
      if (contentType) res.set('Content-Type', contentType);

      await pipeline(Readable.fromWeb(response.body), res);
    } catch (err) {
      if (err.name === 'AbortError' && res.destroyed) return;
      sendRouteError(res, err.name === 'AbortError' ? 504 : 502,
        err.name === 'AbortError' ? 'Download timed out' : err.message);
    } finally {
      clearTimeout(headerTimeout);
    }
  });

  // Start a background remux job. The UI polls its progress, then downloads the
  // regular (non-fragmented) MP4 when it is complete.
  router.post('/download-video-jobs', (req, res) => {
    let details;
    try {
      details = videoRequestDetails(req);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const job = startVideoJob(details.targetUrl, details.outputName);
    res.status(202).json(publicJobStatus(job));
  });

  router.get('/download-video-jobs/:id', (req, res) => {
    const job = videoJobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download job not found or expired' });
    res.json(publicJobStatus(job));
  });

  router.get('/download-video-jobs/:id/file', (req, res) => {
    const job = videoJobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Download job not found or expired' });
    if (job.status !== 'complete') {
      return res.status(409).json({ error: 'Video is not ready for download' });
    }
    sendCompletedJob(job, res);
  });

  // Direct endpoint kept for bookmarks and callers without JavaScript. It waits
  // for the regular MP4 to finish, then starts the response download.
  const downloadVideo = async (req, res) => {
    let details;
    try {
      details = videoRequestDetails(req);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const job = startVideoJob(details.targetUrl, details.outputName);
    let clientDisconnected = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        removeVideoJob(job);
      }
    });

    await job.completion;
    if (clientDisconnected) return;
    if (job.status === 'failed') {
      return sendRouteError(res, 502, job.error);
    }
    sendCompletedJob(job, res);
  };

  router.get('/download-video', downloadVideo);
  // Backward-compatible alias for existing bookmarks and callers.
  router.get('/download-m3u8', downloadVideo);

  return router;
}
