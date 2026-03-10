// Seen files routes: GET /api/files, GET /api/seen, POST /api/seen

import { Router } from 'express';

export function createFilesRouter(db) {
  const router = Router();

  // GET /api/files — return all seen files joined with source label + tags
  router.get('/files', (req, res) => {
    const rows = db.prepare(`
      SELECT sf.key, sf.source_url, sf.first_seen, sf.size, sf.last_modified,
             s.label as source_label, s.id as source_id,
             GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) as tags_raw
      FROM seen_files sf
      LEFT JOIN sources s ON sf.source_url = s.url
      LEFT JOIN file_tags ft ON sf.key = ft.file_key
      LEFT JOIN tags t ON ft.tag_id = t.id
      GROUP BY sf.key
      ORDER BY sf.last_modified DESC
    `).all();
    const result = rows.map(row => ({
      key: row.key,
      source_url: row.source_url,
      first_seen: row.first_seen,
      size: row.size,
      last_modified: row.last_modified,
      source_label: row.source_label,
      source_id: row.source_id,
      tags: row.tags_raw
        ? row.tags_raw.split(',').map(t => {
            const [id, name, color] = t.split(':');
            return { id: Number(id), name, color };
          })
        : [],
    }));
    res.json(result);
  });

  // GET /api/seen — return map { key: { sourceUrl, firstSeen, size, lastModified } }
  router.get('/seen', (req, res) => {
    const rows = db.prepare('SELECT * FROM seen_files').all();
    const map = {};
    for (const row of rows) {
      map[row.key] = {
        sourceUrl: row.source_url,
        firstSeen: row.first_seen,
        size: row.size,
        lastModified: row.last_modified,
      };
    }
    res.json(map);
  });

  // POST /api/seen — batch upsert { files: [{ key, sourceUrl, firstSeen, size, lastModified }] }
  router.post('/seen', (req, res) => {
    const { files } = req.body;
    if (!Array.isArray(files)) return res.status(400).json({ error: 'files array required' });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO seen_files (key, source_url, first_seen, size, last_modified)
      VALUES (:key, :sourceUrl, :firstSeen, :size, :lastModified)
    `);

    let inserted = 0;
    db.exec('BEGIN');
    try {
      for (const f of files) {
        const result = insert.run({
          key: f.key,
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

  return router;
}
