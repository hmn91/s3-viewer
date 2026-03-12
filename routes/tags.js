// Tag routes: CRUD for tags + file-tag assignment
// fileKey in URL params is base64-encoded (contains :: and / which break routing)

import { Router } from 'express';

export function createTagsRouter(db) {
  const router = Router();

  // GET /api/tags?project_id=N — list tags, optionally filtered by project
  router.get('/tags', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    const rows = projectId
      ? db.prepare('SELECT * FROM tags WHERE project_id = ? ORDER BY name').all(projectId)
      : db.prepare('SELECT * FROM tags ORDER BY name').all();
    res.json(rows);
  });

  // POST /api/tags — create tag { name, color?, project_id }
  router.post('/tags', (req, res) => {
    const { name, color = '#6366f1', project_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    const pid = Number(project_id);
    // App-level check: tag name must be unique within the same project
    const existing = db.prepare('SELECT id FROM tags WHERE name = ? AND project_id = ?').get(name.trim(), pid);
    if (existing) return res.status(409).json({ error: 'Tag name already exists in this project' });
    try {
      const result = db.prepare(
        'INSERT INTO tags (name, color, project_id) VALUES (?, ?, ?)'
      ).run(name.trim(), color, pid);
      const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(tag);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/tags/:id — update tag { name?, color? }
  router.put('/tags/:id', (req, res) => {
    const { name, color } = req.body;
    const id = Number(req.params.id);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    const newName = name?.trim() ?? tag.name;
    // Check name uniqueness within same project (exclude self)
    if (newName !== tag.name) {
      const conflict = db.prepare('SELECT id FROM tags WHERE name = ? AND project_id = ? AND id != ?').get(newName, tag.project_id, id);
      if (conflict) return res.status(409).json({ error: 'Tag name already exists in this project' });
    }
    try {
      db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(newName, color ?? tag.color, id);
      res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(id));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/tags/:id — delete tag (cascades file_tags via FK)
  router.delete('/tags/:id', (req, res) => {
    // Manually delete file_tags first (node:sqlite may not enforce FK cascades by default)
    db.prepare('DELETE FROM file_tags WHERE tag_id = ?').run(Number(req.params.id));
    db.prepare('DELETE FROM tags WHERE id = ?').run(Number(req.params.id));
    res.json({ deleted: true });
  });

  // GET /api/files/:fileKey/tags — get tags for a file (fileKey is base64-encoded)
  router.get('/files/:fileKey/tags', (req, res) => {
    const fileKey = Buffer.from(req.params.fileKey, 'base64').toString();
    const rows = db.prepare(`
      SELECT t.* FROM tags t
      JOIN file_tags ft ON ft.tag_id = t.id
      WHERE ft.file_key = ?
    `).all(fileKey);
    res.json(rows);
  });

  // POST /api/files/:fileKey/tags — assign tag { tagId }
  router.post('/files/:fileKey/tags', (req, res) => {
    const fileKey = Buffer.from(req.params.fileKey, 'base64').toString();
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ error: 'tagId required' });
    try {
      db.prepare('INSERT OR IGNORE INTO file_tags (file_key, tag_id) VALUES (?, ?)').run(fileKey, tagId);
      res.json({ assigned: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/files/:fileKey/tags/:tagId — remove tag from file
  router.delete('/files/:fileKey/tags/:tagId', (req, res) => {
    const fileKey = Buffer.from(req.params.fileKey, 'base64').toString();
    db.prepare('DELETE FROM file_tags WHERE file_key = ? AND tag_id = ?').run(
      fileKey, Number(req.params.tagId)
    );
    res.json({ removed: true });
  });

  return router;
}
