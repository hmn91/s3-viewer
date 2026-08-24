// File download routes: stream original URLs or remux HLS (.m3u8) streams to MP4.

import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';

const MAX_FILENAME_LENGTH = 180;
const MAX_FFMPEG_ERROR_LENGTH = 16_000;
const REMOTE_HEADER_TIMEOUT_MS = 30_000;

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

export function createDownloadsRouter() {
  const router = Router();

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

  // Remux HLS into a fragmented MP4 stream. No temporary file is written to disk.
  const downloadVideo = (req, res) => {
    let targetUrl;
    try {
      targetUrl = req.query.source
        ? parseEncodedDownloadUrl(req.query.source)
        : parseDownloadUrl(req.query.url);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const outputName = mp4Filename(requestedFilename(req, targetUrl));
    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', targetUrl.toString(),
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let ffmpegError = '';
    let spawnFailed = false;
    let clientDisconnected = false;

    ffmpeg.stderr.on('data', chunk => {
      if (ffmpegError.length < MAX_FFMPEG_ERROR_LENGTH) ffmpegError += chunk.toString();
    });

    ffmpeg.once('spawn', () => {
      res.attachment(outputName);
      res.type('video/mp4');
      ffmpeg.stdout.pipe(res, { end: false });
    });

    ffmpeg.once('error', err => {
      spawnFailed = true;
      const message = err.code === 'ENOENT'
        ? 'FFmpeg is not installed or is not available in PATH'
        : `Could not start FFmpeg: ${err.message}`;
      sendRouteError(res, 503, message);
    });

    ffmpeg.once('close', code => {
      if (spawnFailed || clientDisconnected) return;
      if (code === 0) {
        if (!res.writableEnded) res.end();
        return;
      }

      const detail = ffmpegError.trim().slice(0, MAX_FFMPEG_ERROR_LENGTH) || `FFmpeg exited with code ${code}`;
      console.error(`M3U8 download failed: ${detail}`);
      sendRouteError(res, 502, `M3U8 conversion failed: ${detail}`);
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        if (ffmpeg.exitCode === null && !ffmpeg.killed) ffmpeg.kill();
      }
    });
  };

  router.get('/download-video', downloadVideo);
  // Backward-compatible alias for existing bookmarks and callers.
  router.get('/download-m3u8', downloadVideo);

  return router;
}
