# S3 Viewer

Localhost web app to browse, tag, and manage files from S3-compatible public bucket URLs.

## Features

- **Multi-project** — organize S3 sources into isolated projects
- **Fetch & browse** — fetches S3 bucket XML listings and stores seen files in a local SQLite DB
- **Tagging** — create color-coded tags per project, assign to files
- **Comments** — add inline notes to files
- **Hide/unhide** — suppress files from the listing without deleting records
- **Global search** — search across projects, files, sources, and tags
- **CORS proxy** — built-in proxy route to bypass browser CORS when fetching S3 XML

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in — no external DB driver needed)

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` if needed (optional — defaults work out of the box).

## Run

```bash
# production
npm start

# development (auto-restart on file change)
npm run dev
```

Opens at `http://localhost:3000` (or `PORT` env var).

## Data

SQLite database is stored at `data/s3viewer.db`. All data is local — nothing is sent externally.

## Project Structure

```
s3-viewer/
├── server.js              # Express app, DB init, route mounting
├── routes/
│   ├── projects.js        # Projects CRUD + global search
│   ├── sources.js         # S3 source URLs CRUD
│   ├── files.js           # Seen files, hide/unhide, comments
│   ├── tags.js            # Tags CRUD + file-tag assignment
│   └── proxy.js           # CORS proxy for S3 XML fetch
├── public/
│   ├── index.html         # SPA entry point
│   ├── app.js             # Main app bootstrap
│   ├── style.css
│   └── modules/           # Frontend JS modules
└── data/
    └── s3viewer.db        # SQLite database (auto-created)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET/POST/PUT/DELETE | `/api/projects` | Project management |
| PATCH | `/api/projects/:id/last-fetch` | Update last fetch timestamp |
| GET | `/api/search?q=&type=` | Global search |
| GET/POST/PUT/DELETE | `/api/sources` | S3 source URL management |
| GET | `/api/files?project_id=N` | List files with tags |
| GET/POST | `/api/seen` | Seen-files map (used by fetch flow) |
| PUT | `/api/files/:key/comment` | Save comment |
| POST/DELETE | `/api/files/:key/hide` | Hide / unhide file |
| GET | `/api/hidden?project_id=N` | List hidden file keys |
| GET/POST/PUT/DELETE | `/api/tags` | Tag management |
| POST/DELETE | `/api/files/:key/tags` | Assign / remove tag from file |
| GET | `/api/fetch?url=` | CORS proxy for S3 XML |
