# OpenIssue — Complete LLM Handover Document

> **Purpose**: Full technical handover for an LLM continuation agent. Covers every file, endpoint, data model, data flow, design decision, and known state. Read this in full before making any changes.

---

## 0. Project Identity

| Field | Value |
|---|---|
| **Name** | OpenIssue |
| **Type** | Full-stack SaaS — GitHub Issue Intelligence Hub for maintainers |
| **Root** | `/Users/subhamkumar/Downloads/CHAINVOTE/` |
| **Backend** | Python 3.11 · FastAPI · SQLite (SQLAlchemy) · FAISS · sentence-transformers · Groq LLM |
| **Frontend** | React 18 · Vite 5 · React Router 7 · lucide-react · react-markdown |
| **Backend port** | `http://localhost:8000` |
| **Frontend port** | `http://localhost:5173` |
| **Start command** | `./start-all.sh` (runs both in parallel) |

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  BROWSER (React/Vite @ :5173)                                       │
│                                                                     │
│  Landing → GithubLogin → RepoSelect → Dashboard → ClusterDetail     │
│                                              ↓                      │
│                                         IssueDetail                 │
│                                         SearchResults               │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTP / SSE / REST
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  FASTAPI BACKEND (@ :8000)                                          │
│                                                                     │
│  /api/v1/github/*   ← Main router (crawl, clusters, issues, triage)│
│  /api/v1/ai/*       ← Semantic search via FAISS + Groq             │
│  /api/v1/issues/*   ← Legacy ingestion endpoint                    │
│  /api/v1/clusters/* ← Legacy in-memory cluster endpoint            │
│  /api/v1/system/*   ← System health telemetry                      │
└───────────┬─────────────────────────┬───────────────────────────────┘
            │                         │
     ┌──────▼──────┐         ┌────────▼────────┐
     │  SQLite DB  │         │  FAISS Index    │
     │ openissue.db│         │ backend/storage/│
     │             │         │ {repo}.index    │
     │ issues      │         │ {repo}.json     │
     │ clusters    │         └─────────────────┘
     │ issue_triage│
     └─────────────┘
            │
     ┌──────▼──────┐
     │  GitHub API │
     │ api.github  │
     │ .com        │
     └─────────────┘
```

### Data Flow: Repository Sync

```
User selects repo (RepoSelect)
    → POST /api/v1/github/sync {repo: "owner/repo"}
    → Backend starts background_crawl() task
    → Paginates GitHub REST API (100/page, incremental via since=)
    → Saves to SQLite IssueModel
    → Runs EmbeddingEngine (sentence-transformers MiniLM-L6-v2)
    → Loads vectors into FAISS IndexFlatIP (persisted to disk)
    → Runs DBSCAN clustering (scikit-learn, cosine metric)
    → For each cluster: calls LLM (Groq / Gemma-2-9b-it) for 1-line insight
    → Saves ClusterModel rows to DB
    ← SSE stream back to Dashboard: cluster_found events
    ← complete event when done
```

---

## 2. Directory Tree

```
CHAINVOTE/
├── start-all.sh              # Starts backend (uvicorn) + frontend (vite)
├── docker-compose.yml        # Not actively used (SQLite replaces PG/Redis)
├── handover.md               # THIS FILE
│
├── backend/
│   ├── main.py               # FastAPI app factory + router registration
│   ├── requirements.txt      # Python deps
│   ├── openissue.db          # SQLite database (WAL mode)
│   ├── .env                  # GITHUB_TOKEN, GROQ_API_KEY, etc.
│   ├── .env.template         # Copy of expected env keys
│   └── src/
│       ├── core/
│       │   ├── config.py     # Pydantic settings (reads .env)
│       │   ├── logger.py     # Structured logger setup
│       │   └── exceptions.py # IntelligenceError + global handlers
│       ├── db/
│       │   └── models.py     # SQLAlchemy ORM models + DB init
│       ├── schemas/
│       │   └── issue.py      # Pydantic request/response schemas
│       ├── services/
│       │   ├── github/
│       │   │   └── github_service.py   # Async GitHub API client
│       │   └── ai/
│       │       ├── embedding_engine.py # sentence-transformers wrapper
│       │       ├── vector_store.py     # FAISS index per-repo
│       │       ├── clustering_engine.py # DBSCAN wrapper
│       │       └── llm_service.py      # Groq/Gemma LLM + fallback
│       └── api/routes/
│           ├── github.py     # PRIMARY: sync, clusters, issues, triage
│           ├── ai_search.py  # Semantic search
│           ├── issues.py     # Legacy ingestion
│           ├── clusters.py   # Legacy in-memory cluster
│           └── system.py     # System health telemetry
│
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx          # React DOM entry
        ├── App.jsx           # Router + route declarations
        ├── index.css         # Global base styles
        └── pages/
            ├── Landing.jsx           # Home page
            ├── GithubLogin.jsx       # Auth page (no real GitHub OAuth)
            ├── RepoSelect.jsx        # Repo input + verify + sync trigger
            ├── Dashboard.jsx         # Main intelligence dashboard (SSE)
            ├── ClusterDetail.jsx     # Cluster drill-down page
            ├── IssueDetail.jsx       # Issue thread + maintainer tools
            ├── SearchResults.jsx     # AI search results page
            ├── SpatialMatrixView.jsx # FAISS vector visualization
            ├── VectorIndexView.jsx   # Vector index stats view
            └── IssuePreviewModal.jsx # Issue hover preview modal
```

---

## 3. Database Models (`backend/src/db/models.py`)

### `IssueModel` — table: `issues`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | Internal DB ID |
| `repo_name` | String | `owner/repo` slug, indexed |
| `github_issue_id` | Integer | GitHub issue number |
| `title` | String | Issue title |
| `body` | String | Body text (truncated to 2000 chars on ingest) |
| `priority_score` | Float | 0.0–1.0 heuristic |
| `created_at` | DateTime | DB row creation time |
| `github_updated_at` | String | ISO 8601, used for incremental sync |
| `labels` | String | Comma-separated GitHub label names |
| `state` | String | `open` or `closed` |

### `ClusterModel` — table: `clusters`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | Internal DB ID |
| `repo_name` | String | `owner/repo` slug |
| `cluster_label` | Integer | DBSCAN cluster label (0, 1, 2, …) |
| `size` | Integer | Number of issues in cluster |
| `urgency` | String | `Critical` / `High` / `Medium` |
| `summary_insight` | String | 1-line LLM insight |
| `llm_full_analysis` | String | Full LLM output |
| `similarity_score` | Float | Cohesion score (currently 88.5 fixed) |
| `github_issue_numbers` | String | Comma-separated GitHub issue numbers |

### `IssueTriage` — table: `issue_triage`
| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | Internal DB ID |
| `repo_name` | String | `owner/repo` slug |
| `issue_number` | Integer | GitHub issue number |
| `priority` | String | `p0`, `p1`, `p2`, `p3` or null |
| `triage_status` | String | `needs-triage` / `triaged` / `needs-repro` / `backlog` |
| `bookmarked` | Integer | 0 or 1 |
| `pinned` | Integer | 0 or 1 |
| `locked` | Integer | 0 or 1 |
| `linked_pr` | String | PR number string |
| `notes` | String | Internal maintainer notes |
| `updated_at` | DateTime | Auto-updated on change |

> **DB Engine**: SQLite with WAL mode + NORMAL synchronous. No migrations tool — `Base.metadata.create_all()` is called at import time. Adding columns requires a raw `ALTER TABLE` or dropping and recreating the DB.

---

## 4. Environment Variables (`backend/.env`)

```env
GITHUB_TOKEN=ghp_xxx          # GitHub PAT for authenticated API calls (5000 req/hr vs 60)
LLM_API_KEY=gsk_xxx           # Groq API key for Gemma LLM
LLM_PROVIDER=groq             # "groq" or anything else = mock fallback
LLM_MODEL=gemma2-9b-it        # Groq model name
EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2  # sentence-transformers model
DBSCAN_EPS=0.25               # DBSCAN epsilon (cosine distance)
DBSCAN_MIN_SAMPLES=2          # DBSCAN min_samples
FAISS_STORAGE_DIR=storage     # Relative path for FAISS index files
ENVIRONMENT=development
```

---

## 5. Complete API Reference

### Router Prefixes
| Prefix | Module | Tag |
|---|---|---|
| `/api/v1/github` | `github.py` | GitHub |
| `/api/v1/ai` | `ai_search.py` | AI Search |
| `/api/v1/issues` | `issues.py` | Issues (legacy) |
| `/api/v1/clusters` | `clusters.py` | Clusters (legacy) |
| `/api/v1/system` | `system.py` | System |
| `/health` | `main.py` | — |

---

### 5.1 `/api/v1/github` — Primary GitHub Intelligence Router

#### `GET /api/v1/github/verify?repo=owner/repo`
- **Purpose**: Validates a repo slug exists on GitHub before syncing.
- **Returns**: `{ "status": "ok", "metadata": { "open_issues_count": int, "name": str } }`
- **Used by**: `RepoSelect.jsx` before triggering sync.

---

#### `POST /api/v1/github/sync`
- **Body**: `{ "repo": "owner/repo" }`
- **Returns**: `text/event-stream` (SSE)
- **Purpose**: The central intelligence pipeline trigger. Does TWO things simultaneously:
  1. Kicks off `background_crawl()` as a BackgroundTask (async pagination + embedding + clustering)
  2. Immediately streams `_stream_intelligence()` (reads cached DB clusters to frontend in real time)
- **SSE Event Types**:
  ```json
  { "type": "status",        "payload": { "msg": "..." } }
  { "type": "cluster_found", "payload": { "cluster_label": int, "insight": str, "llm_summary": str, "similarity_score": str, "issue_count": int, "urgency": str, "github_issue_numbers": str, "progress": str } }
  { "type": "complete",      "payload": { "msg": str, "total_issues": int, "total_clusters": int, "repo": str } }
  { "type": "error",         "payload": { "msg": str } }
  ```
- **State**: Uses `_sync_status`, `_vector_stores`, `_sync_locks` module-level dicts. **These reset on server restart.**
- **Used by**: `Dashboard.jsx` (streams cluster cards in real-time).

---

#### `GET /api/v1/github/cluster/{id}?repo=owner/repo`
- **Purpose**: Fetch a single cluster by `cluster_label` + `repo`. Used when the frontend navigates to a cluster via deep link (cold cache).
- **Returns**:
  ```json
  { "cluster_label": int, "insight": str, "llm_summary": str, "similarity_score": str, "issue_count": int, "urgency": str, "github_issue_numbers": [int, ...], "repo": str }
  ```
- **Used by**: `ClusterDetail.jsx` fallback fetch.

---

#### `DELETE /api/v1/github/cluster/{cluster_id}/issue/{issue_number}?repo=owner/repo`
- **Purpose**: Remove a single issue number from a cluster's `github_issue_numbers` CSV and decrement `size`. **Real DB write.**
- **Returns**: `{ "status": "removed", "cluster_id": int, "issue_number": int, "remaining": int }`
- **Used by**: `IssueDetail.jsx` "Remove from Cluster" button (MaintainerToolsPanel).

---

#### `POST /api/v1/github/cluster/{cluster_id}/reanalyze?repo=owner/repo`
- **Purpose**: Queue a background LLM re-analysis of a specific cluster. Runs `_reanalyze()` in a BackgroundTask which calls `llm.generate_cluster_insight()` and overwrites `summary_insight` + `llm_full_analysis`.
- **Returns**: `{ "status": "queued", "cluster_id": int, "message": str }`
- **Used by**: `IssueDetail.jsx` "Re-run AI Analysis" button.

---

#### `GET /api/v1/github/triage/{issue_number}?repo=owner/repo`
- **Purpose**: Fetch persisted triage state (priority, status, bookmark, pin, lock, linked PR) for an issue.
- **Returns**: Full `IssueTriage` row as JSON. Returns defaults if no triage row exists yet.
- **Used by**: `IssueDetail.jsx` — both `TriagePanel` and `MaintainerToolsPanel` load from this on mount.

---

#### `PATCH /api/v1/github/triage/{issue_number}?repo=owner/repo`
- **Body** (all optional):
  ```json
  { "priority": "p0|p1|p2|p3", "triage_status": "needs-triage|triaged|needs-repro|backlog", "bookmarked": bool, "pinned": bool, "locked": bool, "linked_pr": "string", "notes": "string" }
  ```
- **Purpose**: Upsert triage state. Creates row if absent, patches fields otherwise.
- **Returns**: `{ "status": "updated", "issue_number": int }`
- **Used by**: `IssueDetail.jsx` — every triage action calls this. **State persists across page reloads.**

---

#### `GET /api/v1/github/issue/{number}?repo=owner/repo`
- **Purpose**: Server-side proxy to GitHub REST API. Fetches full issue + first 100 comments. Bypasses browser CORS/403 issues.
- **Returns**:
  ```json
  { "number": int, "title": str, "state": "open|closed", "body": str, "created_at": str, "updated_at": str, "user": { "login": str, "avatar_url": str, "html_url": str }, "labels": [{ "name": str, "color": str }], "assignees": [...], "comments_count": int, "html_url": str, "repo": str, "comments": [{ "id": int, "body": str, "created_at": str, "user": {...} }] }
  ```
- **Used by**: `IssueDetail.jsx` on mount.

---

#### `DELETE /api/v1/github/repo?repo=owner/repo`
- **Purpose**: Wipe all issues, clusters, and FAISS memory for a repo. Full reset.
- **Returns**: `{ "status": "flushed", "repo": str }`

---

#### `GET /api/v1/github/contents?repo=owner/repo&path=path/to/file`
- **Purpose**: Server-side proxy for GitHub Contents API. Used to browse repo files.
- **Returns**: GitHub Contents API JSON (array for directories, object for files).

---

#### `GET /api/v1/github/raw?url=https://raw.githubusercontent.com/...`
- **Purpose**: Proxy raw file content (bypasses CORS on raw.githubusercontent.com).
- **Returns**: Plain text file content.

---

#### `GET /api/v1/github/ws` (WebSocket)
- **Purpose**: Real-time telemetry stream. Sends system stats + DB stats every 2 seconds.
- **Used by**: Dashboard status bar / system monitor.

---

### 5.2 `/api/v1/ai` — Semantic Search

#### `POST /api/v1/ai/search`
- **Body**: `{ "repo": "owner/repo", "query": "your question" }`
- **Purpose**: 4-step AI search:
  1. Embed query via `EmbeddingEngine` (MiniLM)
  2. FAISS nearest-neighbor search (top 5)
  3. Fetch full issue text from DB for matched IDs
  4. Groq/Gemma LLM synthesizes a conversational answer citing issue numbers
- **Returns**: `{ "answer": str, "sources": [int, ...] }` (GitHub issue numbers)
- **Requirement**: `_vector_stores[repo]` must be populated (i.e., sync must have been run this session or FAISS file must exist on disk). If not, returns HTTP 400.
- **Used by**: `SearchResults.jsx`

---

### 5.3 `/api/v1/issues` — Legacy Ingestion

#### `POST /api/v1/issues/`
- **Body**: `{ "title": str, "body": str }`
- **Purpose**: Manually ingest a single issue with real-time embedding + duplicate detection. Designed for webhook/API submissions, not the main UI flow.
- **Returns**: `{ "id": int, "title": str, "priority_score": float, "duplicate_count": int, "similar_issues": [int] }`

---

### 5.4 `/api/v1/clusters` — Legacy In-Memory Clustering

#### `GET /api/v1/clusters/`
- **Purpose**: Live DBSCAN over the in-memory vector store. **Not used by modern UI** — Dashboard uses the DB-backed SSE stream instead.
- **Returns**: `[{ "cluster_id": int, "issue_count": int, "insight": str, "urgency": str, "issues": [...] }]`

---

### 5.5 `/api/v1/system` — System Health

#### `GET /api/v1/system/status`
- **Purpose**: Returns real process telemetry (psutil) + DB row counts + DB file size.
- **Returns**:
  ```json
  { "process": { "pid": int, "cpu_percent": float, "memory_rss_mb": float, "threads": int }, "system": { "cpu_percent_total": float, "memory_percent": float }, "database": { "total_issues": int, "total_clusters": int, "repos_tracked": int, "db_size_mb": float, "repo_breakdown": [{ "repo": str, "issues": int, "clusters": int }] }, "status": "healthy" }
  ```

---

### 5.6 Root

#### `GET /health`
- **Returns**: `{ "status": "ok", "environment": "development" }`

---

## 6. Frontend Pages & Routes

### Route Table (`App.jsx`)

| Route | Component | Notes |
|---|---|---|
| `/` | `Landing` | Marketing landing page |
| `/login` | `GithubLogin` | Simulated auth (no real OAuth) |
| `/select-repo` | `RepoSelect` | Repo entry + verify + sync |
| `/dashboard` | `Dashboard` | Main dashboard (no repo in URL) |
| `/dashboard/:owner/:repoName` | `Dashboard` | Repo-scoped dashboard |
| `/cluster/:id` | `ClusterDetail` | Legacy cluster deep-link |
| `/cluster/:owner/:repoName/:id` | `ClusterDetail` | Repo-scoped cluster deep-link |
| `/issue/:owner/:repoName/:number` | `IssueDetail` | Issue thread + maintainer tools |
| `/search` | `SearchResults` | AI semantic search results |

---

### Page Details

#### `Landing.jsx`
Simple marketing page. Has CTA button → `/login`.

---

#### `GithubLogin.jsx`
Simulates GitHub OAuth. Clicking "Continue with GitHub" navigates to `/select-repo`. No real OAuth token is obtained; GitHub API calls are server-side using `GITHUB_TOKEN` from `.env`.

---

#### `RepoSelect.jsx`
- Accepts a `owner/repo` string input.
- Calls `GET /api/v1/github/verify?repo=` to validate.
- On success: stores repo in `sessionStorage` as `openissue_repo`, navigates to `/dashboard/:owner/:repoName`.

---

#### `Dashboard.jsx` ⭐ Primary page
- Calls `POST /api/v1/github/sync` → receives SSE stream.
- Renders cluster cards in real-time as `cluster_found` events arrive.
- Stores cluster list in `sessionStorage` as `openissue_clusters` (JSON array).
- Each cluster card links to `/cluster/:owner/:repoName/:cluster_label`.
- Contains tabs: Overview, Spatial Matrix (`SpatialMatrixView`), Vector Index (`VectorIndexView`), and System Monitor.
- Has a search bar that navigates to `/search?q=...&repo=...`.

**Key sessionStorage keys set by Dashboard:**
- `openissue_repo` → `"owner/repo"` string
- `openissue_clusters` → JSON array of cluster objects

---

#### `ClusterDetail.jsx`
- Reads `:owner`, `:repoName`, `:id` from URL params.
- **Cache-first**: tries to find cluster in `sessionStorage.openissue_clusters`.
- **API-fallback**: if not found (cold cache / deep-link), calls `GET /api/v1/github/cluster/{id}?repo=`.
- Displays cluster insight, urgency, issue list.
- **Issue links**: clicking an issue navigates to `/issue/:owner/:repoName/:number` (internal navigation, not GitHub).
- De-dupes issue numbers with `[...new Set()]`.

---

#### `IssueDetail.jsx` ⭐ Most complex page
Three-panel layout: top nav + thread (left) + sidebar (right).

**Data loading**: `GET /api/v1/github/issue/{number}?repo=` on mount.

**Cluster context**: reads from `sessionStorage.openissue_clusters` to find if this issue is part of a cluster.

**Sidebar panels (top → bottom)**:

1. **IssueHealth** — Computed from issue metadata (no API call):
   - `staleDays` = days since `updated_at`
   - `health` = `hot` / `active` / `stale` / `cold` based on comment density
   - Visual score bar + age/comment stats

2. **TriagePanel** — API-backed:
   - Loads from `GET /api/v1/github/triage/{number}?repo=` on mount
   - Priority buttons (P0–P3) and triage status buttons call `PATCH /api/v1/github/triage/{number}` on click
   - Shows "Saving…" indicator during PATCH

3. **MaintainerToolsPanel** — Mix of real API calls + clipboard operations:
   - Loads bookmark/pin/lock/linked_pr from `GET /api/v1/github/triage/{number}` on mount
   - **Bookmark/Pin/Lock** → `PATCH /api/v1/github/triage/{number}` — **persists to DB**
   - **Merge as Duplicate** → copies a pre-written redirect comment to clipboard
   - **Link Fixing PR** → `PATCH /api/v1/github/triage/{number}` with `linked_pr` + copies comment
   - **Transfer Fix** → copies consolidated fix template to clipboard
   - **Remove from Cluster** → `DELETE /api/v1/github/cluster/{cluster_label}/issue/{number}` — **real DB write**
   - **Re-run AI Analysis** → `POST /api/v1/github/cluster/{cluster_label}/reanalyze` — **real background task**
   - **Reply Templates** → 8 pre-written templates (Needs Repro, Stale, Duplicate, Won't Fix, Fixed, Need Info, Transferred, Investigating). Each is editable then copied to clipboard.
   - **Notify All / Broadcast** → Toast only (requires GitHub App for real dispatch)
   - **Close as Completed / Not Planned** → copies closing comment to clipboard (requires GitHub write OAuth for automatic close)

4. **Participants** — renders avatar grid from comment authors
5. **Timeline** — opened/updated dates

**Toast system**: Single shared `toastMsg` state at page level, passed down as `toast()` function prop to all panels.

---

#### `SearchResults.jsx`
- Reads `?q=` and `?repo=` from URL query params.
- Calls `POST /api/v1/ai/search`.
- Displays AI answer + source issue numbers.

---

#### `SpatialMatrixView.jsx`
Embedded in Dashboard tab. Visual representation of FAISS cluster positions.

#### `VectorIndexView.jsx`
Embedded in Dashboard tab. Shows vector index stats.

#### `IssuePreviewModal.jsx`
Hover preview modal for issues in the cluster card list.

---

## 7. AI / ML Stack

### EmbeddingEngine (`embedding_engine.py`)
- Model: `all-MiniLM-L6-v2` (sentence-transformers)
- Dimension: 384
- Singleton: `engine = EmbeddingEngine()`
- `generate_embedding(text)` → L2-normalized `np.ndarray`
- `generate_embeddings(texts)` → batch normalized list
- **CPU-bound**: always called via `run_in_threadpool()` in async context to avoid blocking the event loop

### VectorStore (`vector_store.py`)
- Per-repo FAISS `IndexFlatIP` (inner product = cosine on normalized vectors)
- ID map: list of `db_id` integers parallel to FAISS index positions
- Persists to: `backend/storage/{repo_name}.index` + `{repo_name}.json`
- Loaded at startup from disk if files exist
- Module-level dict: `_vector_stores: Dict[str, VectorStore]` in `github.py`

### ClusteringEngine (`clustering_engine.py`)
- DBSCAN with `metric='cosine'`
- `eps=0.25`, `min_samples=2` (configurable via settings)
- Returns `{cluster_label: [db_id, ...]}`. Label `-1` = noise (discarded).
- Singleton: `clusterer = ClusteringEngine()`

### LLMService (`llm_service.py`)
- Provider: Groq (`gemma2-9b-it` by default)
- Two methods:
  - `generate_cluster_insight(context_texts)` → async, max 60 tokens, temperature 0.1
  - `answer_semantic_query(query, context_texts)` → async, max 400 tokens, temperature 0.2
- Fallback: if `LLM_API_KEY` missing or Groq errors → keyword-based heuristic string
- Singleton: `llm = LLMService()`

---

## 8. GitHub Service (`github_service.py`)

- Async paginator using `httpx.AsyncClient`
- PRs filtered out (`"pull_request" in item`)
- Body truncated to 2000 chars
- Incremental sync via `since=` query param (uses `github_updated_at` of most recent stored issue)
- Rate limit handling: on 403, checks `Retry-After` header and sleeps
- 0.1s delay between pages to avoid primary rate limits
- Singleton: `github_service = GitHubService()`

Authentication:
- With `GITHUB_TOKEN`: 5000 req/hr
- Without: 60 req/hr (unauthenticated)

---

## 9. Key Design Decisions & Gotchas

### CORS
- Hardcoded whitelist: `["http://localhost:5173", "http://127.0.0.1:5173"]`
- If frontend runs on a different port, update `main.py`

### Database
- **No migration tool**. Schema changes need either `ALTER TABLE` SQL or dropping `openissue.db`.
- WAL mode enabled for concurrency (multiple readers + one writer).
- `Base.metadata.create_all()` runs at import → new models/columns appear **only on next server start**.

### Session State
- `_vector_stores`, `_sync_status`, `_sync_locks` are module-level Python dicts.
- **They reset on server restart.** FAISS is saved to disk; re-loading happens in `VectorStore.__init__` → `load_index()`.
- Cluster cards in frontend are stored in `sessionStorage.openissue_clusters`. Tab close = lost. This is intentional (cache for session only).

### SSE Sync Architecture
- `POST /sync` does NOT wait for crawl to complete.
- It immediately starts streaming already-cached DB data to the frontend.
- The new crawl runs in the background and updates the DB.
- **Next sync call** will pick up the newly inserted data.
- This "stale-while-revalidate" pattern means the first sync of a large repo shows 0 clusters initially, then clusters appear on the second sync call.

### Issue Numbers vs DB IDs
- **ALWAYS use `github_issue_number` (e.g., `9046`) for GitHub API calls and user-facing URLs.**
- **Use `IssueModel.id` (internal auto-increment) only for FAISS mapping.**
- The FAISS `id_map` stores internal `db_id`, not GitHub issue numbers.

### LLM Fallback
- If `LLM_API_KEY` is not set or Groq call fails, a deterministic keyword-based heuristic runs instead.
- No errors are thrown to the user — degraded gracefully.

### Triage Upsert
- `PATCH /api/v1/github/triage/{issue_number}` creates a new `IssueTriage` row if none exists.
- Only fields included in the PATCH body are updated (partial update via `if payload.field is not None`).

### ClusterDetail Navigation
- **`/cluster/:id`** (legacy) — uses only cluster label, reads `openissue_repo` from sessionStorage
- **`/cluster/:owner/:repoName/:id`** — preferred, fully scoped
- Both routes render the same component. The difference is where `fullRepo` is derived from.

### "Remove from Cluster" Behavior
- Only removes the issue number from `github_issue_numbers` CSV column.
- Does NOT delete the cluster row or re-run DBSCAN.
- On next full sync, the cluster may be re-populated if the issue is still in the DB.
- To permanently exclude: would need a blocklist (not yet implemented).

---

## 10. Frontend Dependencies

```json
{
  "react": "18.2.0",
  "react-dom": "18.2.0",
  "react-router-dom": "7.14.0",
  "react-markdown": "10.1.0",
  "remark-gfm": "4.0.1",
  "react-syntax-highlighter": "16.1.1",
  "lucide-react": "0.292.0",
  "@tanstack/react-query": "5.96.2",
  "axios": "1.14.0"
}
```

**Note**: `react-query` and `axios` are installed but **not actively used in the main pages**. All data fetching uses native `fetch()`. They remain available if you want to refactor.

---

## 11. Backend Dependencies

```
fastapi, uvicorn           # Web framework
faiss-cpu                  # Vector similarity index
sentence-transformers      # MiniLM embedding model (downloads ~80MB on first run)
scikit-learn               # DBSCAN clustering
psutil                     # System metrics
sqlalchemy                 # ORM
httpx                      # Async HTTP client (GitHub API, Groq API)
pydantic-settings          # .env loading
groq                       # Groq SDK (optional, httpx used directly)
redis, psycopg2-binary     # Listed in requirements but NOT used (SQLite replaces PG, no queue needed)
```

---

## 12. What Is Fully Functional vs Simulated

### ✅ Fully Functional (real API + DB operations)
- GitHub issue sync (pagination, incremental, store to SQLite)
- FAISS vector indexing + persistence to disk
- DBSCAN clustering + ClusterModel persistence
- Groq/Gemma LLM cluster insights (with keyword fallback)
- AI semantic search (embed → FAISS → LLM answer)
- Issue detail viewer (proxied GitHub API with comments)
- Triage state (priority, status, bookmark, pin, lock, linked PR) → **SQLite**
- Remove issue from cluster → **real DB write**
- Re-run AI analysis → **real background task**
- System health telemetry → **real psutil**

### ⚠️ UI-Only / Clipboard (GitHub write access requires OAuth)
- Merge as Duplicate → generates comment text, copies to clipboard
- Close as Completed / Not Planned → generates closing comment, copies to clipboard
- Reply Templates → editable pre-written comments, copies to clipboard
- Transfer Fix to Clean Issue → generates template, copies to clipboard
- Link Fixing PR → saves PR number to DB + copies comment to clipboard
- Notify All Participants → toast only (needs GitHub App webhook for real dispatch)
- Lock / Pin conversation on GitHub → saved to our DB (not propagated to GitHub API)

### 🔴 Not Implemented
- Real GitHub OAuth (JWT session, write tokens)
- GitHub App webhook receiver
- Issue milestone assignment
- Real-time GitHub event subscriptions
- Email/Slack notification dispatch
- Multi-user authentication / team workspaces

---

## 13. How to Start the Project

```bash
cd /Users/subhamkumar/Downloads/CHAINVOTE

# First time setup
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cd ../frontend && npm install

# Every run
./start-all.sh
```

Backend starts at `http://localhost:8000`  
Frontend starts at `http://localhost:5173`

---

## 14. Common Failure Modes

| Symptom | Cause | Fix |
|---|---|---|
| `/sync` returns 0 clusters | First-time sync – DB has issues but no clusters yet | Wait for background crawl, then click sync again |
| 403 on sync | No `GITHUB_TOKEN` + rate limited | Add `GITHUB_TOKEN` to `backend/.env` |
| `400 Intelligence matrix not initialized` on search | FAISS in-memory store not loaded this session | Run sync first |
| Issue detail fails | Bad `repo` param or issue doesn't exist | Check URL params match `owner/repo/number` format |
| Triage not persisting | `issue_triage` table missing (old DB) | Restart backend — `create_all()` will create it |
| `ClusterDetail` shows blank | Cold cache + cluster_label not in DB | Should auto-fallback to `GET /cluster/{id}` API |
| `sentence-transformers` slow first load | Model downloads ~80MB on first run | Wait ~30s on first launch |

---

## 15. Next Development Priorities (recommended order)

1. **Real GitHub OAuth** → swap `GithubLogin.jsx` for GitHub OAuth flow, get write token, enable real comment posting + issue closing
2. **GitHub App Webhook** → receive push events to auto-trigger incremental sync
3. **Notify All via GitHub** → use write token to post comment mentioning all participants
4. **Milestone / Project Board Assignment** → add to `MaintainerToolsPanel` with GitHub API write call
5. **Stale Issue Auto-Closer** → background cron job using `triage_status=backlog` + age heuristic
6. **Multi-repo Dashboard** → stored list of repos replacing sessionStorage with a real user model
7. **Slack/Email Integration** → replace toast-only notifications with real dispatch
8. **Remove from Cluster Blocklist** → prevent re-clustering of explicitly excluded issues
9. **DBSCAN Tuning UI** → let maintainer adjust `eps` and `min_samples` per repo
10. **Vector search pagination** → currently limited to top 5 results

---

*Last updated: 2026-04-07 | Generated by Antigravity AI assistant*
