// Paginated file listing, seen-file persistence, and hide/unhide routes.

import { Router } from 'express';

export const FILE_PAGE_LIMITS = [20, 50, 100];
const DEFAULT_FILE_PAGE_LIMIT = 50;
const SORT_COLUMNS = {
  displayName: 'sf.key',
  folder: 'sf.key',
  sourceLabel: 's.label',
  size: 'sf.size',
  lastModified: 'sf.last_modified',
  firstSeen: 'sf.first_seen',
  comment: 'sf.comment',
};

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

function parseBoolean(value, fallback, name) {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function parseIdList(query, name) {
  if (!Object.hasOwn(query, name)) return null;
  if (typeof query[name] !== 'string') throw new Error(`${name} must be a comma-separated ID list`);
  if (query[name] === '') return [];
  const values = query[name].split(',');
  if (values.some(value => !/^\d+$/.test(value) || Number(value) < 1)) {
    throw new Error(`${name} must contain positive integer IDs`);
  }
  return [...new Set(values.map(Number))];
}

export function parseFilesQuery(query) {
  const projectId = parsePositiveInteger(query.project_id, null, 'project_id');
  if (!projectId) throw new Error('project_id required');
  const page = parsePositiveInteger(query.page, 1, 'page');
  const limit = parsePositiveInteger(query.limit, DEFAULT_FILE_PAGE_LIMIT, 'limit');
  if (!FILE_PAGE_LIMITS.includes(limit)) throw new Error('limit must be one of 20, 50, or 100');

  const sortCol = query.sort_col || null;
  const sortDir = query.sort_dir || null;
  if (sortCol && !SORT_COLUMNS[sortCol]) throw new Error('Invalid sort_col');
  if (sortDir && !['asc', 'desc'].includes(sortDir)) throw new Error('sort_dir must be asc or desc');

  return {
    projectId,
    page,
    limit,
    showHidden: parseBoolean(query.show_hidden, false, 'show_hidden'),
    sourceIds: parseIdList(query, 'source_ids'),
    tagIds: parseIdList(query, 'tag_ids'),
    includeNoTag: parseBoolean(query.include_no_tag, false, 'include_no_tag'),
    search: typeof query.search === 'string' ? query.search : '',
    negativeSearch: parseBoolean(query.negative_search, false, 'negative_search'),
    newOnly: parseBoolean(query.new_only, false, 'new_only'),
    sortCol,
    sortDir,
  };
}

function buildFileFilters(options) {
  const clauses = ['sf.project_id = ?'];
  const params = [options.projectId];

  if (!options.showHidden) clauses.push('hf.file_key IS NULL');

  if (options.sourceIds !== null) {
    if (options.sourceIds.length === 0) clauses.push('0 = 1');
    else {
      clauses.push(`s.id IN (${options.sourceIds.map(() => '?').join(', ')})`);
      params.push(...options.sourceIds);
    }
  }

  if (options.search) {
    const escapedSearch = options.search.toLowerCase().replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escapedSearch}%`;
    const matchSql = `(LOWER(sf.key) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(sf.comment, '')) LIKE ? ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM file_tags search_ft
      JOIN tags search_t ON search_t.id = search_ft.tag_id
      WHERE search_ft.file_key = sf.key AND search_ft.project_id = sf.project_id
        AND LOWER(search_t.name) LIKE ? ESCAPE '\\'
    ))`;
    clauses.push(options.negativeSearch ? `NOT ${matchSql}` : matchSql);
    params.push(pattern, pattern, pattern);
  }

  if (options.tagIds !== null) {
    const tagParts = [];
    if (options.includeNoTag) {
      tagParts.push(`NOT EXISTS (
        SELECT 1 FROM file_tags no_tag_ft
        WHERE no_tag_ft.file_key = sf.key AND no_tag_ft.project_id = sf.project_id
      )`);
    }
    if (options.tagIds.length > 0) {
      tagParts.push(`EXISTS (
        SELECT 1 FROM file_tags filter_ft
        WHERE filter_ft.file_key = sf.key AND filter_ft.project_id = sf.project_id
          AND filter_ft.tag_id IN (${options.tagIds.map(() => '?').join(', ')})
      )`);
      params.push(...options.tagIds);
    }
    clauses.push(tagParts.length > 0 ? `(${tagParts.join(' OR ')})` : '0 = 1');
  }

  if (options.newOnly) clauses.push("datetime(sf.first_seen) >= datetime('now', '-1 day')");
  return { whereSql: clauses.join(' AND '), params };
}

// Decode URL-safe base64 (RFC 4648 §5): - → +, _ → /, restore padding
function decodeFileKey(encoded) {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from(padded, 'base64').toString();
}

export function createFilesRouter(db) {
  const router = Router();

  // GET /api/files?project_id=N&page=1&limit=50&show_hidden=false
  // Returns one filtered page plus totals. Hidden rows are included only when requested.
  router.get('/files', (req, res) => {
    let options;
    try {
      options = parseFilesQuery(req.query);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { whereSql, params } = buildFileFilters(options);
    const totalItems = db.prepare(`
      SELECT COUNT(*) AS count
      FROM seen_files sf
      LEFT JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
      LEFT JOIN hidden_files hf ON sf.key = hf.file_key AND sf.project_id = hf.project_id
      WHERE ${whereSql}
    `).get(...params).count;
    const projectTotalItems = db.prepare(
      'SELECT COUNT(*) AS count FROM seen_files WHERE project_id = ?'
    ).get(options.projectId).count;
    const hiddenCount = db.prepare(
      'SELECT COUNT(*) AS count FROM hidden_files WHERE project_id = ?'
    ).get(options.projectId).count;
    const withoutNewFilter = buildFileFilters({ ...options, newOnly: false });
    const newCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM seen_files sf
      LEFT JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
      LEFT JOIN hidden_files hf ON sf.key = hf.file_key AND sf.project_id = hf.project_id
      WHERE ${withoutNewFilter.whereSql}
        AND datetime(sf.first_seen) >= datetime('now', '-1 day')
    `).get(...withoutNewFilter.params).count;

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.limit);
    const page = totalPages === 0 ? 1 : Math.min(options.page, totalPages);
    const offset = (page - 1) * options.limit;
    const sortColumn = options.sortCol ? SORT_COLUMNS[options.sortCol] : 'sf.last_modified';
    const sortDirection = options.sortCol && options.sortDir ? options.sortDir.toUpperCase() : 'DESC';

    const rows = db.prepare(`
      SELECT sf.key, sf.source_url, sf.first_seen, sf.size, sf.last_modified, sf.comment,
             s.label AS source_label, s.id AS source_id,
             CASE WHEN hf.file_key IS NULL THEN 0 ELSE 1 END AS is_hidden,
             GROUP_CONCAT(t.id || ':' || t.name || ':' || t.color) AS tags_raw
      FROM seen_files sf
      LEFT JOIN sources s ON sf.source_url = s.url AND s.project_id = sf.project_id
      LEFT JOIN hidden_files hf ON sf.key = hf.file_key AND sf.project_id = hf.project_id
      LEFT JOIN file_tags ft ON sf.key = ft.file_key AND ft.project_id = sf.project_id
      LEFT JOIN tags t ON ft.tag_id = t.id
      WHERE ${whereSql}
      GROUP BY sf.key, sf.project_id
      ORDER BY ${sortColumn} ${sortDirection}, sf.key ASC
      LIMIT ? OFFSET ?
    `).all(...params, options.limit, offset);

    const items = rows.map(row => ({
      key: row.key,
      source_url: row.source_url,
      first_seen: row.first_seen,
      size: row.size,
      last_modified: row.last_modified,
      source_label: row.source_label,
      source_id: row.source_id,
      is_hidden: Boolean(row.is_hidden),
      comment: row.comment || null,
      tags: row.tags_raw
        ? row.tags_raw.split(',').map(t => {
            const [id, name, color] = t.split(':');
            return { id: Number(id), name, color };
          })
        : [],
    }));

    res.json({
      items,
      pagination: {
        page,
        limit: options.limit,
        total_items: totalItems,
        total_pages: totalPages,
      },
      project_total_items: projectTotalItems,
      hidden_count: hiddenCount,
      new_count: newCount,
    });
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

  // POST /api/hidden/batch -- hide many fetched files in one transaction
  router.post('/hidden/batch', (req, res) => {
    const { project_id, file_keys } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!Array.isArray(file_keys)) return res.status(400).json({ error: 'file_keys array required' });

    const projectId = Number(project_id);
    const keys = [...new Set(file_keys.filter(key => typeof key === 'string' && key.length > 0))];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO hidden_files (file_key, project_id) VALUES (?, ?)'
    );
    let inserted = 0;

    db.exec('BEGIN');
    try {
      for (const key of keys) inserted += insert.run(key, projectId).changes;
      db.exec('COMMIT');
      res.json({ hidden: keys.length, inserted });
    } catch (err) {
      db.exec('ROLLBACK');
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

  return router;
}
