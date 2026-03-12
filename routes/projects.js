// Projects CRUD routes + global search
// GET/POST/PUT/DELETE /api/projects
// PATCH /api/projects/:id/last-fetch
// GET /api/search?q=&type=

import { Router } from 'express';

export function createProjectsRouter(db) {
  const router = Router();

  // GET /api/projects — list all projects with aggregated source_count and file_count
  router.get('/projects', (_req, res) => {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.created_at, p.last_fetch_at,
             COUNT(DISTINCT s.id)   AS source_count,
             COUNT(DISTINCT sf.key) AS file_count
      FROM projects p
      LEFT JOIN sources s  ON s.project_id = p.id
      LEFT JOIN seen_files sf ON sf.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `).all();
    res.json(rows);
  });

  // POST /api/projects — create project { name }
  router.post('/projects', (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    try {
      const result = db.prepare('INSERT INTO projects (name) VALUES (?)').run(name.trim());
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ ...row, source_count: 0, file_count: 0 });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Project name already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/projects/:id — rename project { name }
  router.put('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    try {
      db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name.trim(), id);
      res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Project name already exists' });
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/projects/:id — delete project (cascades via app logic: delete sources → seen_files unlinked)
  router.delete('/projects/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    // Delete all project data: file_tags → tags → seen_files → sources → project
    db.prepare('DELETE FROM file_tags WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM tags WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM seen_files WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM sources WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    res.json({ deleted: true });
  });

  // PATCH /api/projects/:id/last-fetch — update last_fetch_at to now
  router.patch('/projects/:id/last-fetch', (req, res) => {
    const id = Number(req.params.id);
    const now = new Date().toISOString();
    db.prepare('UPDATE projects SET last_fetch_at = ? WHERE id = ?').run(now, id);
    res.json({ last_fetch_at: now });
  });

  // GET /api/search?q=&type=all|project|file|source|tag
  router.get('/search', (req, res) => {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'all';
    if (q.length < 2) return res.json({ projects: [], files: [], sources: [], tags: [] });

    const like = `%${q}%`;
    const result = { projects: [], files: [], sources: [], tags: [] };

    if (type === 'all' || type === 'project') {
      result.projects = db.prepare(`
        SELECT p.id, p.name, p.created_at, p.last_fetch_at,
               COUNT(DISTINCT s.id)   AS source_count,
               COUNT(DISTINCT sf.key) AS file_count
        FROM projects p
        LEFT JOIN sources s  ON s.project_id = p.id
        LEFT JOIN seen_files sf ON sf.project_id = p.id
        WHERE LOWER(p.name) LIKE LOWER(?)
        GROUP BY p.id LIMIT 20
      `).all(like);
    }

    if (type === 'all' || type === 'file') {
      const includeHidden = req.query.include_hidden === '1';
      const hiddenJoin = `LEFT JOIN hidden_files hf ON sf.key = hf.file_key AND sf.project_id = hf.project_id`;
      const hiddenFilter = includeHidden ? '' : 'AND hf.file_key IS NULL';
      result.files = db.prepare(`
        SELECT sf.key, sf.source_url, sf.last_modified, sf.comment,
               s.label AS source_label, s.project_id,
               p.name  AS project_name,
               CASE WHEN hf.file_key IS NOT NULL THEN 1 ELSE 0 END AS is_hidden
        FROM seen_files sf
        JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
        JOIN projects p ON sf.project_id = p.id
        ${hiddenJoin}
        WHERE (LOWER(sf.key) LIKE LOWER(?) OR LOWER(COALESCE(sf.comment,'')) LIKE LOWER(?))
        ${hiddenFilter}
        ORDER BY sf.last_modified DESC LIMIT 20
      `).all(like, like);
    }

    if (type === 'all' || type === 'source') {
      result.sources = db.prepare(`
        SELECT s.id, s.label, s.url, s.project_id, p.name AS project_name
        FROM sources s
        JOIN projects p ON s.project_id = p.id
        WHERE LOWER(s.label) LIKE LOWER(?) OR LOWER(s.url) LIKE LOWER(?)
        LIMIT 20
      `).all(like, like);
    }

    if (type === 'all' || type === 'tag') {
      result.tags = db.prepare(`
        SELECT t.id, t.name, t.color, t.project_id, p.name AS project_name
        FROM tags t
        JOIN projects p ON t.project_id = p.id
        WHERE LOWER(t.name) LIKE LOWER(?)
        LIMIT 20
      `).all(like);
    }

    res.json(result);
  });

  return router;
}
