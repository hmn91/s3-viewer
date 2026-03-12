// S3 Viewer Express server — setup, DB init, route mounting
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createSourcesRouter } from './routes/sources.js';
import { createFilesRouter } from './routes/files.js';
import { createProxyRouter } from './routes/proxy.js';
import { createTagsRouter } from './routes/tags.js';
import { createProjectsRouter } from './routes/projects.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// === DB INIT ===
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 's3viewer.db'));

// Enable FK constraints (must be set per-connection in SQLite)
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    last_fetch_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS seen_files (
    key TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    size INTEGER,
    last_modified TEXT
  );
  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS file_tags (
    file_key TEXT NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (file_key, tag_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );
`);

// === MIGRATIONS ===

// Check if a column exists in a table (guard for ALTER TABLE)
function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}

// Add project_id to sources if missing (from before project support)
if (!columnExists('sources', 'project_id')) {
  db.exec('ALTER TABLE sources ADD COLUMN project_id INTEGER');
}

// Add project_id to tags if missing
if (!columnExists('tags', 'project_id')) {
  db.exec('ALTER TABLE tags ADD COLUMN project_id INTEGER');
}

// Migrate sources table from UNIQUE(url) → UNIQUE(url, project_id) so same S3 URL
// can be added to different projects independently.
const sourcesSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'").get();
if (sourcesSchema && !sourcesSchema.sql.includes('UNIQUE(url, project_id)')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE sources_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      project_id INTEGER,
      UNIQUE(url, project_id)
    );
    INSERT INTO sources_new SELECT id, label, url, created_at, project_id FROM sources;
    DROP TABLE sources;
    ALTER TABLE sources_new RENAME TO sources;
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

// Migrate tags table from UNIQUE(name) → UNIQUE(name, project_id) so same tag name
// can exist in different projects. SQLite requires a table recreation to change constraints.
const tagsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tags'").get();
if (tagsSchema && !tagsSchema.sql.includes('UNIQUE(name, project_id)')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE tags_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT DEFAULT (datetime('now')),
      project_id INTEGER,
      UNIQUE(name, project_id)
    );
    INSERT INTO tags_new SELECT id, name, color, created_at, project_id FROM tags;
    DROP TABLE tags;
    ALTER TABLE tags_new RENAME TO tags;
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

// Migrate orphan records into a "Default" project
const orphanSource = db.prepare('SELECT id FROM sources WHERE project_id IS NULL LIMIT 1').get();
const orphanTag = db.prepare('SELECT id FROM tags WHERE project_id IS NULL LIMIT 1').get();
if (orphanSource || orphanTag) {
  let defaultProject = db.prepare("SELECT id FROM projects WHERE name = 'Default'").get();
  if (!defaultProject) {
    const result = db.prepare("INSERT INTO projects (name) VALUES ('Default')").run();
    defaultProject = { id: result.lastInsertRowid };
  }
  const pid = defaultProject.id;
  db.prepare('UPDATE sources SET project_id = ? WHERE project_id IS NULL').run(pid);
  db.prepare('UPDATE tags SET project_id = ? WHERE project_id IS NULL').run(pid);
}

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// === ROUTES ===
app.use('/api', createProjectsRouter(db));
app.use('/api', createSourcesRouter(db));
app.use('/api', createFilesRouter(db));
app.use('/api', createTagsRouter(db));
app.use('/api', createProxyRouter());

// === FALLBACK SPA ===
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`S3 Viewer running at http://localhost:${PORT}`);
});
