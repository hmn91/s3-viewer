// Seen files routes: GET /api/files, GET /api/seen, POST /api/seen, hide/unhide routes

import { Router } from 'express';

// Decode URL-safe base64 (RFC 4648 §5): - → +, _ → /, restore padding
function decodeFileKey(encoded) {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString();
}

export function createFilesRouter(db) {
  const router = Router();

  // GET /api/files?project_id=N — return seen files for a project, joined with source info
  router.get('/files', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    // Join sources matching both url AND project_id to avoid ambiguity when same URL
    // exists in multiple projects.
    const query = projectId
      ? `SELECT sf.key, sf.source_url, sf.first_seen, sf.size, sf.last_modified, sf.comment,
                s.label as source_label, s.id as source_id,
                GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_raw
         FROM seen_files sf
         LEFT JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
         LEFT JOIN file_tags ft ON sf.key = ft.file_key AND ft.project_id = sf.project_id
         LEFT JOIN tags t ON ft.tag_id = t.id
         WHERE sf.project_id = ?
         GROUP BY sf.key
         ORDER BY sf.last_modified DESC`
      : `SELECT sf.key, sf.source_url, sf.first_seen, sf.size, sf.last_modified, sf.comment,
                s.label as source_label, s.id as source_id,
                GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_raw
         FROM seen_files sf
         LEFT JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
         LEFT JOIN file_tags ft ON sf.key = ft.file_key AND ft.project_id = sf.project_id
         LEFT JOIN tags t ON ft.tag_id = t.id
         GROUP BY sf.key
         ORDER BY sf.last_modified DESC`;
    const rows = projectId
      ? db.prepare(query).all(projectId)
      : db.prepare(query).all();
    const result = rows.map(row => ({
      key: row.key,
      source_url: row.source_url,
      first_seen: row.first_seen,
      size: row.size,
      last_modified: row.last_modified,
      source_label: row.source_label,
      source_id: row.source_id,
      comment: row.comment || null,
      tags: row.tags_raw
        ? row.tags_raw.split(',').map(t => {
            const [id, name, color] = t.split(':');
            return { id: Number(id), name, color };
          })
        : [],
    }));
    res.json(result);
  });

  // GET /api/seen?project_id=N — return map { key: { sourceUrl, firstSeen, size, lastModified, tags, comment } }
  // Includes tag assignments so fetch-all can preserve tags on S3-fetched files.
  router.get('/seen', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    const query = projectId
      ? `SELECT sf.*, GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_raw
         FROM seen_files sf
         LEFT JOIN file_tags ft ON sf.key = ft.file_key AND ft.project_id = sf.project_id
         LEFT JOIN tags t ON ft.tag_id = t.id
         WHERE sf.project_id = ?
         GROUP BY sf.key`
      : `SELECT sf.*, GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_raw
         FROM seen_files sf
         LEFT JOIN file_tags ft ON sf.key = ft.file_key AND ft.project_id = sf.project_id
         LEFT JOIN tags t ON ft.tag_id = t.id
         GROUP BY sf.key`;
    const rows = projectId
      ? db.prepare(query).all(projectId)
      : db.prepare(query).all();
    const map = {};
    for (const row of rows) {
      map[row.key] = {
        sourceUrl: row.source_url,
        firstSeen: row.first_seen,
        size: row.size,
        lastModified: row.last_modified,
        comment: row.comment || '',
        tags: row.tags_raw
          ? row.tags_raw.split(',').map(t => {
              const [id, name, color] = t.split(':');
              return { id: Number(id), name, color };
            })
          : [],
      };
    }
    res.json(map);
  });

  // POST /api/seen — batch upsert { project_id, files: [{ key, sourceUrl, firstSeen, size, lastModified }] }
  // project_id is required to scope seen records per project.
  router.post('/seen', (req, res) => {
    const { files, project_id } = req.body;
    if (!Array.isArray(files)) return res.status(400).json({ error: 'files array required' });
    if (!project_id) return res.status(400).json({ error: 'project_id required' });

    const projectId = Number(project_id);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO seen_files (key, project_id, source_url, first_seen, size, last_modified)
      VALUES (:key, :projectId, :sourceUrl, :firstSeen, :size, :lastModified)
    `);

    let inserted = 0;
    db.exec('BEGIN');
    try {
      for (const f of files) {
        const result = insert.run({
          key: f.key,
          projectId,
          sourceUrl: f.sourceUrl,
          firstSeen: f.firstSeen,
          size: f.size ?? null,
          lastModified: f.lastModified ?? null,
        });
        inserted += result.changes;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      return res.status(500).json({ error: err.message });
    }
    res.json({ inserted });
  });

  // PUT /api/files/:fileKey/comment — save comment for a file
  router.put('/files/:fileKey/comment', (req, res) => {
    const fileKey = decodeFileKey(req.params.fileKey);
    const { comment, project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    try {
      db.prepare('UPDATE seen_files SET comment = ? WHERE key = ? AND project_id = ?')
        .run(comment || null, fileKey, Number(project_id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/files/:fileKey/hide — hide a file
  router.post('/files/:fileKey/hide', (req, res) => {
    const fileKey = decodeFileKey(req.params.fileKey);
    const { project_id } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    try {
      db.prepare('INSERT OR IGNORE INTO hidden_files (file_key, project_id) VALUES (?, ?)')
        .run(fileKey, Number(project_id));
      res.json({ hidden: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/files/:fileKey/hide?project_id=N — unhide a file
  router.delete('/files/:fileKey/hide', (req, res) => {
    const fileKey = decodeFileKey(req.params.fileKey);
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    if (!projectId) return res.status(400).json({ error: 'project_id required' });
    db.prepare('DELETE FROM hidden_files WHERE file_key = ? AND project_id = ?')
      .run(fileKey, projectId);
    res.json({ hidden: false });
  });

  // GET /api/hidden?project_id=N — list hidden file keys for project
  router.get('/hidden', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    if (!projectId) return res.status(400).json({ error: 'project_id required' });
    const rows = db.prepare('SELECT file_key FROM hidden_files WHERE project_id = ?').all(projectId);
    res.json(rows.map(r => r.file_key));
  });

  return router;
}
