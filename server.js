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

db.exec('PRAGMA foreign_keys = ON');

// === SCHEMA RESET GUARD ===
// If file_tags lacks project_id (old schema), drop all tables and start fresh.
// Accepts data loss in exchange for full project isolation.
const ftSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='file_tags'").get();
if (ftSchema && !ftSchema.sql.includes('project_id')) {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS file_tags;
    DROP TABLE IF EXISTS seen_files;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS sources;
    DROP TABLE IF EXISTS projects;
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

// === CLEAN SCHEMA ===
// Every table is fully project-scoped. file_tags includes project_id so tag
// assignments are isolated per project even when the same S3 key appears in multiple projects.
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now')),
    last_fetch_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sources (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    url        TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(url, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS seen_files (
    key          TEXT NOT NULL,
    project_id   INTEGER NOT NULL,
    source_url   TEXT NOT NULL,
    first_seen   TEXT NOT NULL,
    size         INTEGER,
    last_modified TEXT,
    PRIMARY KEY (key, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#6366f1',
    project_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS file_tags (
    file_key   TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    tag_id     INTEGER NOT NULL,
    PRIMARY KEY (file_key, project_id, tag_id),
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS hidden_files (
    file_key   TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    PRIMARY KEY (file_key, project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

// === MIGRATIONS ===
// Add comment column to seen_files if missing (schema evolution without data loss)
const sfCols = db.prepare("PRAGMA table_info(seen_files)").all();
if (!sfCols.some(c => c.name === 'comment')) {
  db.exec("ALTER TABLE seen_files ADD COLUMN comment TEXT");
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
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`S3 Viewer running at http://localhost:${PORT}`);
});
