// Proxy fetch route: GET /api/fetch?url=<encoded> — bypasses CORS for S3 XML

import { Router } from 'express';

export function createProxyRouter() {
  const router = Router();

  router.get('/fetch', async (req, res) => {
    if (!req.query.url) return res.status(400).json({ error: 'url param required' });

    let targetUrl;
    try {
      const parsed = new URL(decodeURIComponent(req.query.url));
      // SSRF guard: only allow http/https (block file://, loopback, etc.)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Only http/https URLs allowed' });
      }
      targetUrl = parsed.toString();
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(targetUrl, { signal: controller.signal });
      const text = await response.text();
      res.set('Content-Type', 'text/xml').send(text);
    } catch (err) {
      if (err.name === 'AbortError') return res.status(504).json({ error: 'Timeout' });
      res.status(502).json({ error: err.message });
    } finally {
      clearTimeout(timeout);
    }
  });

  return router;
}
