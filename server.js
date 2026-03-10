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

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// === DB INIT ===
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(join(dataDir, 's3viewer.db'));

db.exec(`
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

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// === ROUTES ===
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
