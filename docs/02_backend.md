# OpenIssue — Backend Documentation

> **Part 2 of 7** | Technology: Python 3.11+, FastAPI, SQLite (WAL), FAISS, SentenceTransformers, Groq

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Layout](#project-layout)
4. [Application Entrypoint](#application-entrypoint)
5. [Configuration](#configuration)
6. [Database Layer](#database-layer)
7. [AI Services](#ai-services)
   - [Embedding Engine](#embedding-engine)
   - [Vector Store (FAISS)](#vector-store-faiss)
   - [Clustering Engine](#clustering-engine)
   - [LLM Service](#llm-service)
8. [Intelligence Pipeline](#intelligence-pipeline)
9. [GitHub Ingestion](#github-ingestion)
10. [Background Sync Worker](#background-sync-worker)
11. [SSE Streaming Architecture](#sse-streaming-architecture)
12. [WebSocket Telemetry](#websocket-telemetry)
13. [Startup Recovery](#startup-recovery)
14. [Exception Handling](#exception-handling)
15. [Logging](#logging)
16. [Local Development](#local-development)
17. [Known Limitations](#known-limitations)

---

## Overview

The OpenIssue backend is a FastAPI application that:

1. **Crawls** GitHub repository issues via the REST API (paginated, incremental)
2. **Embeds** issue text into dense 384-dimension vectors using `all-MiniLM-L6-v2`
3. **Indexes** vectors in FAISS (flat inner-product index for cosine similarity)
4. **Clusters** vectors with DBSCAN (cosine metric)
5. **Summarizes** each cluster with Groq's Gemma 4 LLM (parallelized, rate-limited)
6. **Streams** results to the frontend via Server-Sent Events
7. **Broadcasts** sync progress via WebSocket

The design philosophy is **fail-open**: non-critical AI components (embedding, clustering, LLM) are fully isolated. If any of them fail, the core API remains responsive and returns degraded-but-valid responses.

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| FastAPI | 0.110+ | HTTP framework, async request handling |
| Uvicorn | 0.29+ | ASGI server |
| SQLAlchemy | 2.x | ORM + session management |
| SQLite | built-in | Primary datastore (file-based, zero-ops) |
| FAISS (faiss-cpu) | 1.8+ | Vector similarity search and storage |
| sentence-transformers | 3.x | `all-MiniLM-L6-v2` embedding model (384d) |
| scikit-learn | 1.4+ | DBSCAN clustering |
| httpx | 0.27+ | Async HTTP client (GitHub API + Groq API) |
| numpy | 1.26+ | Vector math, NaN/Inf guards |
| pydantic-settings | 2.x | Config management from `.env` |

---

## Project Layout

```
backend/
├── main.py                          # App factory, middleware, route mounting
├── openissue.db                     # SQLite database (git-ignored)
├── storage/
│   └── vector_indices/              # Persisted FAISS index files per repo
│       ├── facebook_react.index     # FAISS binary index
│       ├── facebook_react.json      # id_map (DB row ID → FAISS position)
│       └── facebook_react.manifest.json  # Model name, dimension, build time
├── venv/                            # Python virtual environment
└── src/
    ├── core/
    │   ├── config.py                # Pydantic Settings (reads .env)
    │   ├── logger.py                # Structured logger setup
    │   └── exceptions.py            # IntelligenceError + global handler
    ├── db/
    │   └── models.py                # SQLAlchemy models + DB engine init
    ├── schemas/
    │   └── issue.py                 # Pydantic request/response schemas
    ├── services/
    │   ├── ai/
    │   │   ├── embedding_engine.py  # SentenceTransformer singleton
    │   │   ├── vector_store.py      # FAISS index (atomic write, thread-safe)
    │   │   ├── clustering_engine.py # DBSCAN wrapper with guards
    │   │   └── llm_service.py       # Groq API + keyword fallback
    │   └── github/
    │       └── github_service.py    # GitHub REST API paginator
    └── api/
        └── routes/
            ├── github.py            # Sync, SSE, WS, cluster, spatial, stats
            ├── issues.py            # Issue ingestion + list endpoint
            ├── clusters.py          # Cluster CRUD
            ├── ai_search.py         # Semantic search endpoint
            └── system.py            # System health + DB stats
```

---

## Application Entrypoint

**`backend/main.py`** — App factory pattern (`create_app()`):

```python
def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME)

    # CORS for Vite dev server (localhost:5173)
    app.add_middleware(CORSMiddleware, ...)

    # Global exception handlers
    app.add_exception_handler(IntelligenceError, intelligence_exception_handler)
    app.add_exception_handler(Exception, global_exception_handler)

    # Route mounting
    app.include_router(issues.router,   prefix="/api/v1/issues")
    app.include_router(clusters.router, prefix="/api/v1/clusters")
    app.include_router(github.router,   prefix="/api/v1/github")
    app.include_router(ai_search.router,prefix="/api/v1/ai")
    app.include_router(system.router,   prefix="/api/v1/system")

    @app.on_event("startup")
    async def startup_event():
        # Startup crash recovery (see Startup Recovery section)
        ...

    @app.get("/health")
    def health_check():
        return {"status": "ok", "environment": settings.ENVIRONMENT}
```

---

## Configuration

**`src/core/config.py`** — Pydantic `BaseSettings` reads from `.env`:

| Variable | Default | Description |
|---|---|---|
| `EMBEDDING_MODEL_NAME` | `all-MiniLM-L6-v2` | SentenceTransformer model name |
| `FAISS_STORAGE_DIR` | `storage/vector_indices` | Directory for persisted index files |
| `DBSCAN_EPS` | `0.28` | DBSCAN epsilon (cosine distance threshold) |
| `DBSCAN_MIN_SAMPLES` | `2` | Min points to form a core cluster |
| `LLM_PROVIDER` | `groq` | LLM backend: `groq` or `mock` |
| `LLM_MODEL` | `gemma4-26b-it` | Groq model ID |
| `LLM_API_KEY` | _(none)_ | Groq API key (also read as `GROQ_API_KEY`) |
| `GITHUB_TOKEN` | _(none)_ | GitHub PAT for higher rate limits (5000 req/hr) |
| `ENVIRONMENT` | `development` | Shown in `/health` response |

**Default `.env` file:**
```env
GROQ_API_KEY=gsk_...
GITHUB_TOKEN=github_pat_...
LLM_MODEL=gemma4-26b-it
DBSCAN_EPS=0.28
DBSCAN_MIN_SAMPLES=2
```

> **DBSCAN tuning:** `eps=0.28` is tuned for repos with 500+ issues. For smaller repos (< 50 issues), all vectors may fall outside each others' epsilon neighborhood and no clusters form. Lowering to `0.45` gives more permissive clustering at the cost of noisier groupings.

---

## Database Layer

**`src/db/models.py`** — SQLAlchemy ORM with SQLite.

### SQLite Hardening

```python
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor.execute("PRAGMA journal_mode=WAL")      # Concurrent reads during writes
    cursor.execute("PRAGMA synchronous=NORMAL")    # Fast writes, durable on crash
    cursor.execute("PRAGMA foreign_keys=ON")       # Referential integrity enforced
```

WAL (Write-Ahead Logging) mode allows multiple readers + one writer simultaneously, which is essential for SSE streaming while a background sync is writing.

### Schema

#### `issues` — Primary issue store

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | Internal auto-increment ID |
| `repo_name` | String | `owner/repo` format, indexed |
| `github_issue_id` | Integer | GitHub's issue number, indexed |
| `title` | String | Issue title |
| `body` | String | Issue body (markdown) |
| `priority_score` | Float | Heuristic 0.0–1.0 |
| `github_updated_at` | String | ISO timestamp, used for incremental sync |
| `labels` | String | Comma-separated label names |
| `state` | String | `open` or `closed` |

**Unique constraint:** `(repo_name, github_issue_id)` — prevents duplicate ingestion under concurrent sync triggers.

#### `clusters` — AI cluster results

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `repo_name` | String | |
| `cluster_label` | Integer | DBSCAN label (≥0; -1 is noise, excluded) |
| `size` | Integer | Number of issues in cluster |
| `urgency` | String | `Critical` / `High` / `Medium` |
| `summary_insight` | String | One-sentence LLM or keyword summary |
| `llm_full_analysis` | String | Full LLM output |
| `similarity_score` | Float | Mean pairwise cosine similarity × 100 |
| `github_issue_numbers` | String | Comma-separated GitHub issue numbers |

#### `issue_triage` — Maintainer annotations

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `repo_name` | String | |
| `issue_number` | Integer | GitHub issue number |
| `priority` | String | `p0` / `p1` / `p2` / `p3` |
| `triage_status` | String | `needs-triage`, `triaged`, etc. |
| `bookmarked` | Integer | 0/1 boolean |
| `pinned` | Integer | 0/1 boolean |
| `locked` | Integer | 0/1 boolean |
| `linked_pr` | String | PR URL if linked |
| `notes` | String | Maintainer freetext notes |

**Unique constraint:** `(repo_name, issue_number)` — one triage record per issue per repo.

#### `sync_state` — Persistent sync progress

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | |
| `repo_name` | String | Unique per repo |
| `status` | String | `idle` / `syncing` / `failed` / `complete` |
| `last_sync_started` | DateTime | |
| `last_sync_completed` | DateTime | |
| `last_error` | String | Error message from last failed sync |
| `issues_processed` | Integer | Count at last sync |
| `clusters_created` | Integer | Cluster count at last sync |

Used by startup crash recovery. Any row with `status='syncing'` on startup indicates a mid-flight crash.

### Session Management

```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

FastAPI `Depends(get_db)` injects a session per request and closes it after the handler returns. **Critical:** For SSE endpoints, the DB session is loaded, data is extracted to plain dicts, and then the session is closed **before** `StreamingResponse` starts. This prevents connection pool exhaustion under concurrent streaming.

---

## AI Services

### Embedding Engine

**`src/services/ai/embedding_engine.py`**

Wraps `sentence-transformers` `all-MiniLM-L6-v2`. Outputs 384-dimension L2-normalized vectors.

**Lazy singleton pattern:**
```python
# Problem: Eager init crashes the server at startup if model download fails
# (no connectivity = no /health endpoint)
#
# Solution: Double-checked locking lazy singleton
_engine_instance = None
_engine_lock = threading.Lock()

def get_embedding_engine():
    global _engine_instance
    if _engine_instance is None:
        with _engine_lock:
            if _engine_instance is None:
                _engine_instance = EmbeddingEngine()
    return _engine_instance

# Back-compat proxy — existing code using `engine.method()` works unchanged
engine = _LazyEngineProxy()
```

**Text truncation strategy:** MiniLM has a 256-token limit. For long issue bodies:
```python
text = f"{title}. {body[:500]}{' ... ' + body[-300:] if len(body) > 500 else ''}"
```
This keeps title + beginning (context) + end (resolution/reproduction steps).

**CPU isolation:** `generate_embeddings()` (batch) is called via `run_in_threadpool()` to keep PyTorch's CPU-bound encoding off the asyncio event loop.

---

### Vector Store (FAISS)

**`src/services/ai/vector_store.py`**

One `VectorStore` instance per repo, stored in the `_vector_stores` dict in `github.py`.

**Index type:** `faiss.IndexFlatIP` (Flat Inner Product)
- Requires L2-normalized input vectors
- Inner product of two L2-normalized vectors = cosine similarity
- Exhaustive search — O(n) per query, 100% recall
- Appropriate for repos up to ~100k issues on a single machine

**Thread safety:** `threading.RLock()` protects all index mutations. FAISS is not thread-safe for concurrent `add()` + `search()`.

**Atomic persistence:**
```
Write flow:
  1. Write to .index.tmp
  2. Write to .json.tmp
  3. Write to .manifest.json.tmp
  4. os.replace(tmp → final)  ← atomic rename on POSIX
  5. os.replace(tmp → final)
  6. os.replace(tmp → final)

If process dies at step 1-3: .tmp files exist, finals are intact
If process dies at step 4: worst case one file updated, caught by integrity checks on load
```

**Load integrity checks (in order):**
1. Both `.index` and `.json` must exist
2. Manifest `model_name` must match current `EMBEDDING_MODEL_NAME`
3. `loaded_index.d` (dimension) must match current model dimension
4. `loaded_index.ntotal` must equal `len(id_map)` (no torn writes)

If any check fails: **silently start fresh** — no crash, no corruption propagated.

**Persistence files:**
```
storage/vector_indices/
├── {repo_slug}.index          # FAISS binary index (can be MBs for large repos)
├── {repo_slug}.json           # [db_id, db_id, ...] position→DB ID mapping
└── {repo_slug}.manifest.json  # { model_name, dimension, vector_count, written_at }
```

---

### Clustering Engine

**`src/services/ai/clustering_engine.py`**

Wraps `sklearn.cluster.DBSCAN` with cosine metric.

```python
DBSCAN(eps=0.28, min_samples=2, metric='cosine').fit_predict(vectors)
```

**Guards applied before clustering:**

1. **Minimum vector check:** `len(vectors) < min_samples` → skip with warning
2. **NaN/Inf vector filter:** embeddings of zero-length strings produce NaN norms; DBSCAN raises `ValueError` on these
3. **Post-filter minimum:** after removing invalid vectors, must still have ≥ 2 to attempt clustering
4. **`MemoryError` catch:** DBSCAN cosine metric builds an O(n²) distance matrix; on repos with >20k issues, this exceeds RAM. Returns `{}` (empty map) rather than crashing
5. **Fail-open return:** any other exception → returns `{}`, does not write to DB

**Cluster labeling:**
- Labels ≥ 0: valid clusters
- Label `-1`: noise (unclassified points) — excluded from downstream processing

**Urgency heuristic:**
```python
urgency = "Critical" if len(group_ids) >= 10 else "High" if len(group_ids) >= 5 else "Medium"
```

---

### LLM Service

**`src/services/ai/llm_service.py`**

Two public async methods:

#### `generate_cluster_insight(context_texts)`

Calls Groq (`gemma4-26b-it`) with:
- System prompt: "provide a single 15-word max technical summary"
- User prompt: up to 15 issue texts (600 chars each)
- Temperature: 0.1 (near-deterministic)
- Max tokens: 60

**Fallback chain:**
1. Groq API with `LLM_API_KEY` → LLM-generated insight
2. API unavailable / key missing → keyword frequency heuristic (see below)
3. Timeout (12s hard limit) → keyword fallback

**Keyword heuristic:**
```python
def _extract_keywords(texts, top_n=4):
    # Tokenizes combined text, filters stop-words,
    # returns top-N most frequent technical terms
```
Used to generate fallback insights like:
`"React rendering alignment issue identified — pattern: event, react, disabling, stops."`

#### `answer_semantic_query(query, context_texts)`

Called from the AI search endpoint. Passes the maintainer's question + FAISS top-K results to Groq with rules: cite issue numbers, don't invent information.
- Temperature: 0.2
- Max tokens: 400
- Timeout: 20s

---

## Intelligence Pipeline

The full pipeline runs in sequence inside `_recompute_intelligence(repo, db)`:

```
┌─────────────────────────────────────────────────────────────────┐
│                   _recompute_intelligence()                      │
│                                                                 │
│  1. Count issues in DB for repo                                 │
│  2. Load / init VectorStore for repo from disk                  │
│  3. INCREMENTAL EMBED: only new issues not in FAISS id_map       │
│     └─ Chunked in batches of 64                                 │
│     └─ CPU offloaded via run_in_threadpool()                    │
│  4. get_all_vectors() from FAISS                                │
│  5. clusterer.compute_clusters() → cluster_map                  │
│  6. For each cluster (parallel, Semaphore(5)):                  │
│     ├─ Gather issue texts + vectors                             │
│     ├─ Compute real cosine similarity score                     │
│     ├─ Call llm.generate_cluster_insight() (12s timeout)        │
│     └─ Determine urgency heuristic                              │
│  7. Atomic DB replace: DELETE all old clusters, INSERT new ones  │
│  8. db.commit()                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Parallel LLM calls:**
```python
sem = asyncio.Semaphore(5)  # Max 5 concurrent Groq requests
tasks = [rate_limited_cluster(label, ids) for ...]
results = await asyncio.gather(*tasks, return_exceptions=True)
```
Previously sequential: 50 clusters × 15s = 750s stall. Now ~15s regardless of cluster count.

**Similarity score computation (real, not hardcoded):**
```python
# Mean pairwise cosine similarity from upper triangle of dot product matrix
dot_matrix = np.dot(sample, sample.T)
mask = np.triu(np.ones((n, n), dtype=bool), k=1)
sim_score = float(dot_matrix[mask].mean()) * 100.0
```

---

## GitHub Ingestion

**`src/services/github/github_service.py`**

Async paginator that streams issues from the GitHub REST API.

- Uses `GITHUB_TOKEN` if set → 5000 req/hr (vs 60 req/hr unauthenticated)
- Incremental sync: passes `since=` (ISO timestamp of last seen `updated_at`) to skip already-ingested unchanged issues
- Pagination: yields batches of 100 issues until no `next` link in `Link` header
- Handles GitHub 403 (rate limit) and 404 (repo not found) explicitly

**Upsert logic in `background_crawl`:**
```python
# Check by (repo_name, github_issue_id)
existing = db.query(IssueModel).filter(...).first()
if not existing:
    db.add(new IssueModel)
else:
    # Update mutable fields: title, body, state
    existing.title = raw["title"]
    ...
db.commit()  # Per-batch commit
```

---

## Background Sync Worker

**`background_crawl(repo, db_factory)`** in `github.py`

Runs as a FastAPI `BackgroundTask` — started on `POST /api/v1/github/sync` and runs independently from the SSE stream.

**Concurrency guard:**
```python
_sync_locks[repo] = asyncio.Lock()

async with _sync_locks[repo]:
    if not _sync_status[repo]["is_syncing"]:
        background_tasks.add_task(background_crawl, ...)
```
Double-click protection — a second sync request on the same repo is silently ignored while one is running.

**Progress tracking:**
```python
_sync_status[repo] = {
    "processed": int,
    "total_repo": int,
    "is_syncing": bool,
    "last_error": str | None
}
```
Read by the WebSocket endpoint to broadcast progress to the frontend.

---

## SSE Streaming Architecture

The sync endpoint returns a `StreamingResponse` (Server-Sent Events) immediately while the background crawl runs independently.

**Critical design: DB session released before streaming starts**

```python
@router.post("/sync")
async def sync_repository(request_data, background_tasks, request, db):
    # 1. Start background crawl
    background_tasks.add_task(background_crawl, ...)

    # 2. Load cluster snapshots into memory
    clusters = db.query(ClusterModel).filter(...).all()
    cluster_snapshots = [dict(c) for c in clusters]

    # 3. DB session is NOW released by Depends(get_db)
    # StreamingResponse runs AFTER this function returns

    return StreamingResponse(
        _stream_from_snapshots(cluster_snapshots, ...),
        media_type="text/event-stream"
    )
```

Without this pattern, holding `db` open during streaming exhausts the SQLite connection pool at 5+ concurrent users.

**SSE event format:**
```
data: {"type": "status",        "payload": {"msg": "Accessing Matrix Cache..."}}
data: {"type": "cluster_found", "payload": { cluster object }}
data: {"type": "complete",      "payload": {"total_issues": N, "total_clusters": M}}
data: {"type": "error",         "payload": {"msg": "..."}}
```

Events are batched in groups of 20 with `asyncio.sleep(0.05)` debounce between batches. The `request.is_disconnected()` check stops streaming if the client closes the tab.

---

## WebSocket Telemetry

```
ws://localhost:8000/api/v1/github/ws/sync/{repo}
```

Pings the frontend every 2s with current `_sync_status[repo]` dict:
```json
{ "processed": 450, "total_repo": 2500, "is_syncing": true }
```

Also emits `new_activity` when GitHub's events API detects new issue events since last sync.

Handles `WebSocketDisconnect` gracefully — no crash on tab close.

---

## Startup Recovery

```python
@app.on_event("startup")
async def startup_event():
    # Any sync stuck in 'syncing' state = server was killed mid-crawl
    stuck = db.query(SyncState).filter(SyncState.status == "syncing").all()
    for s in stuck:
        s.status = "failed"
        s.last_error = "Server restarted while sync was in progress"
    db.commit()
```

This prevents the UI from showing a perpetually spinning sync that will never complete. The frontend can check `SyncState.status == "failed"` to show a "resume sync" prompt.

---

## Exception Handling

Two global handlers registered in `create_app()`:

### `IntelligenceError`
Domain exception for AI pipeline failures.
```python
class IntelligenceError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        ...
```
Returns: `{"error": {"code": N, "message": "..."}}`

### Global `Exception` handler
Catches everything else.
```python
async def global_exception_handler(request, exc):
    log.critical(f"Unhandled system fault: {str(exc)}", exc_info=True)
    return JSONResponse(500, {"error": {"code": 500, "message": "An unexpected system fault occurred."}})
```

Both return consistent JSON error envelopes (never HTML error pages).

**Route-level fail-open:** Individual route handlers in `github.py` catch exceptions internally and return partial/empty results rather than propagating them. The intelligence pipeline never brings down the server.

---

## Logging

**`src/core/logger.py`** — structured Python logger.

```python
log = setup_logger("openissue.github")
```

Namespace-based loggers: `openissue.github`, `openissue.embedding`, `openissue.vector_store`, `openissue.clustering`, `openissue.llm`.

Log levels used:
- `DEBUG`: vector add/search operations (verbose)
- `INFO`: sync progress, cluster counts, model load
- `WARNING`: NaN vectors dropped, small corpus warnings, LLM timeout fallback
- `ERROR`: API failures, DB write errors, FAISS load failures
- `CRITICAL`: Unhandled exceptions (logged with `exc_info=True` for full traceback)

Output goes to stdout (captured by `./start-all.sh` → `backend.log`).

---

## Local Development

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create .env
echo "GROQ_API_KEY=gsk_..." > .env
echo "GITHUB_TOKEN=github_pat_..." >> .env

# Run
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The `--reload` flag watches all `.py` files and hot-reloads on save. The SQLite DB (`openissue.db`) and FAISS index files persist across restarts.

**Or use the project script:**
```bash
cd /path/to/CHAINVOTE
./start-all.sh    # starts backend + frontend together
```

Logs: `backend.log` (backend), `frontend.log` (Vite).

---

## Known Limitations

| # | Limitation | Real-World Impact |
|---|---|---|
| 1 | FAISS `IndexFlatIP` is O(n) per search | Queries slow past ~100k vectors. Switch to `IndexIVFFlat` with training for larger repos |
| 2 | DBSCAN distance matrix is O(n²) memory | OOM on repos with >20k issues. Caught and handled but clustering simply skips |
| 3 | Single SQLite file | No horizontal scaling. Fine for a single-server deployment; needs PostgreSQL for multi-instance |
| 4 | `_vector_stores` dict is in-memory | Lost on restart. Fixed by lazy disk reload, but first post-restart query has cold-read latency |
| 5 | Groq API has no retry/backoff | Rate limit errors on burst cluster analysis (>60 clusters) cause silent fallbacks to keyword insights |
| 6 | No auth on any API endpoint | Every endpoint is completely public. Fine for local dev, must add API key or OAuth before any network exposure |
| 7 | Per-batch `db.commit()` during crawl | A crash mid-crawl leaves a partial import. Data is consistent but not complete. Full re-sync is the recovery path |
| 8 | `all-MiniLM-L6-v2` 256-token limit | Long issue bodies are head+tail truncated. Technical details in the middle of a long issue may be lost |
