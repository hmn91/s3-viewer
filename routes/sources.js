// Sources CRUD routes: GET/POST/PUT/DELETE /api/sources

import { Router } from 'express';

export function createSourcesRouter(db) {
  const router = Router();

  // GET /api/sources — list all sources ordered by creation date
  router.get('/sources', (req, res) => {
    const rows = db.prepare('SELECT * FROM sources ORDER BY created_at').all();
    res.json(rows);
  });

  // POST /api/sources — add new source { label, url }
  router.post('/sources', (req, res) => {
    const { label, url } = req.body;
    if (!label?.trim() || !url?.trim()) {
      return res.status(400).json({ error: 'label and url are required' });
    }
    try {
      new URL(url); // validate URL format
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    try {
      const stmt = db.prepare('INSERT INTO sources (label, url) VALUES (?, ?)');
      const result = stmt.run(label.trim(), url.trim());
      const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'URL already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/sources/:id — update source { label?, url? }
  router.put('/sources/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Source not found' });

    const label = req.body.label?.trim() ?? existing.label;
    const url = req.body.url?.trim() ?? existing.url;

    if (req.body.url !== undefined) {
      try { new URL(url); } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    try {
      db.prepare('UPDATE sources SET label = ?, url = ? WHERE id = ?').run(label, url, id);
      const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
      res.json(row);
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'URL already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/sources/:id — delete source
  router.delete('/sources/:id', (req, res) => {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Source not found' });
    db.prepare('DELETE FROM sources WHERE id = ?').run(id);
    res.json({ deleted: true });
  });

  return router;
}
