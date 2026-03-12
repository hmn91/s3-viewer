// Sources CRUD routes: GET/POST/PUT/DELETE /api/sources

import { Router } from 'express';

export function createSourcesRouter(db) {
  const router = Router();

  // GET /api/sources?project_id=N — list sources, optionally filtered by project
  router.get('/sources', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    const rows = projectId
      ? db.prepare('SELECT * FROM sources WHERE project_id = ? ORDER BY created_at').all(projectId)
      : db.prepare('SELECT * FROM sources ORDER BY created_at').all();
    res.json(rows);
  });

  // POST /api/sources — add new source { label, url, project_id }
  router.post('/sources', (req, res) => {
    const { label, url, project_id } = req.body;
    if (!label?.trim() || !url?.trim()) {
      return res.status(400).json({ error: 'label and url are required' });
    }
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }
    try {
      new URL(url); // validate URL format
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    const pid = Number(project_id);
    // Per-project URL uniqueness check (same URL allowed in different projects)
    const duplicate = db.prepare('SELECT id FROM sources WHERE url = ? AND project_id = ?').get(url.trim(), pid);
    if (duplicate) return res.status(409).json({ error: 'URL already exists in this project' });
    try {
      const result = db.prepare('INSERT INTO sources (label, url, project_id) VALUES (?, ?, ?)').run(label.trim(), url.trim(), pid);
      const row = db.prepare('SELECT * FROM sources WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
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
      // Per-project URL uniqueness check (exclude self)
      if (url !== existing.url) {
        const conflict = db.prepare('SELECT id FROM sources WHERE url = ? AND project_id = ? AND id != ?').get(url, existing.project_id, id);
        if (conflict) return res.status(409).json({ error: 'URL already exists in this project' });
      }
    }

    try {
      db.prepare('UPDATE sources SET label = ?, url = ? WHERE id = ?').run(label, url, id);
      res.json(db.prepare('SELECT * FROM sources WHERE id = ?').get(id));
    } catch (err) {
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
