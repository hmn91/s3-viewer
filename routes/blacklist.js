// Project-scoped blacklist rule CRUD.

import { Router } from 'express';

const RULE_TYPES = new Set(['file_type', 'url_prefix', 'url_suffix']);

function normalizeValue(ruleType, rawValue) {
  let value = rawValue.trim();
  if (ruleType === 'file_type') {
    if (value.startsWith('*.')) value = value.slice(1);
    if (!value.startsWith('.')) value = `.${value}`;
    value = value.toLowerCase();
  }
  return value;
}

export function createBlacklistRouter(db) {
  const router = Router();

  // GET /api/blacklist-rules?project_id=N
  router.get('/blacklist-rules', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    if (!projectId) return res.status(400).json({ error: 'project_id required' });
    const rows = db.prepare(`
      SELECT * FROM blacklist_rules
      WHERE project_id = ?
      ORDER BY rule_type, value
    `).all(projectId);
    res.json(rows);
  });

  // POST /api/blacklist-rules { project_id, rule_type, value }
  router.post('/blacklist-rules', (req, res) => {
    const { project_id, rule_type, value } = req.body;
    if (!project_id) return res.status(400).json({ error: 'project_id required' });
    if (!RULE_TYPES.has(rule_type)) return res.status(400).json({ error: 'invalid rule_type' });
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: 'value required' });
    }

    const normalized = normalizeValue(rule_type, value);
    try {
      const result = db.prepare(`
        INSERT INTO blacklist_rules (rule_type, value, project_id)
        VALUES (?, ?, ?)
      `).run(rule_type, normalized, Number(project_id));
      res.status(201).json(
        db.prepare('SELECT * FROM blacklist_rules WHERE id = ?').get(result.lastInsertRowid)
      );
    } catch (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'This blacklist rule already exists' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/blacklist-rules/:id?project_id=N
  router.delete('/blacklist-rules/:id', (req, res) => {
    const projectId = req.query.project_id ? Number(req.query.project_id) : null;
    if (!projectId) return res.status(400).json({ error: 'project_id required' });
    const result = db.prepare(
      'DELETE FROM blacklist_rules WHERE id = ? AND project_id = ?'
    ).run(Number(req.params.id), projectId);
    if (!result.changes) return res.status(404).json({ error: 'Blacklist rule not found' });
    res.json({ deleted: true });
  });

  return router;
}
