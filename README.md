# S3 Viewer

Localhost web app to browse, tag, and manage files from S3-compatible public bucket URLs.

## Features

- **Multi-project** — organize S3 sources into isolated projects
- **Fetch & browse** — fetches S3 bucket XML listings and stores seen files in a local SQLite DB
- **Tagging** — create color-coded tags per project, assign to files
- **Comments** — add inline notes to files
- **Hide/unhide** — suppress files from the listing without deleting records
- **File actions** — copy URLs, download original files, and remux `.m3u8` streams to `.mp4`
- **Global search** — search across projects, files, sources, and tags
- **CORS proxy** — built-in proxy route to bypass browser CORS when fetching S3 XML
- **Fetch progress & safe stopping** — live object/page counts, cancellable fetches, and a persisted confirmation for listings over 100 pages
- **Automatic blacklist** — hide fetched files by extension, URL prefix, or URL suffix with project-scoped rules
- **Server-side file pagination** — load 20, 50, or 100 filtered files per request

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in — no external DB driver needed)
- FFmpeg in `PATH` (required only for the `.m3u8` → `.mp4` download action)

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
│   ├── downloads.js       # Original file and M3U8-to-MP4 downloads
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
| PATCH | `/api/projects/:id/file-page-size` | Save the project's 20/50/100 page-size preference |
| GET | `/api/search?q=&type=` | Global search |
| GET/POST/PUT/DELETE | `/api/sources` | S3 source URL management |
| PATCH | `/api/sources/:id/fetch-limit` | Remember approval to fetch beyond 100 listing pages |
| GET | `/api/files?project_id=N&page=1&limit=50&show_hidden=false` | Paginated files (limits: 20, 50, 100) with filter metadata |
| POST | `/api/seen` | Persist fetched files in bounded batches |
| GET | `/api/download?url=&filename=` | Download an original remote file |
| GET | `/api/download-m3u8?url=&filename=` | Remux an M3U8 stream to MP4 with FFmpeg |
| PUT | `/api/files/:key/comment` | Save comment |
| POST/DELETE | `/api/files/:key/hide` | Hide / unhide file |
| POST | `/api/hidden/batch` | Hide many files in one transaction |
| GET/POST/DELETE | `/api/blacklist-rules` | Project blacklist rule management |
| GET/POST/PUT/DELETE | `/api/tags` | Tag management |
| POST/DELETE | `/api/files/:key/tags` | Assign / remove tag from file |
| GET | `/api/fetch?url=` | CORS proxy for S3 XML |

`GET /api/files` always requires `project_id`, defaults to `page=1&limit=50&show_hidden=false`,
and accepts only `20`, `50`, or `100` for `limit`. Its response contains `items`, pagination
metadata, the project-wide hidden count, and the project-wide file count. Search, negative search,
source, tag, NEW, hidden, and sort filters are applied before pagination. The selected page size is
stored per project and restored the next time that project is opened.
