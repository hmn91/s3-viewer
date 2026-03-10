// Seen files routes: GET /api/seen, POST /api/seen

import { Router } from 'express';

export function createFilesRouter(db) {
  const router = Router();

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
