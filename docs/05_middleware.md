# OpenIssue — Middleware Documentation

> **Part 5 of 7** | Covers all request/response processing layers between client and route handlers

---

## Table of Contents

1. [What Is Middleware in This System](#what-is-middleware-in-this-system)
2. [Middleware Stack Diagram](#middleware-stack-diagram)
3. [CORS Middleware](#cors-middleware)
4. [Exception Handler Middleware](#exception-handler-middleware)
5. [Startup Event Middleware](#startup-event-middleware)
6. [Implicit Middleware (FastAPI Built-in)](#implicit-middleware-fastapi-built-in)
7. [Frontend "Middleware" Patterns](#frontend-middleware-patterns)
8. [What's Missing (And Why)](#whats-missing-and-why)

---

## What Is Middleware in This System

Middleware is code that runs **before** and/or **after** every request, wrapping the route handler. In FastAPI, middleware functions intercept the raw HTTP request, optionally modify it, pass it to the handler, then optionally modify the response before sending it back.

OpenIssue uses **three explicit middleware layers** and **several implicit ones** provided by FastAPI/Starlette.

The system does **not** have:
- Authentication middleware (no auth at all)
- Rate limiting middleware
- Request logging middleware (logs happen inside route handlers)
- Compression middleware (gzip)

This is intentional — it's a local development tool, not a public API.

---

## Middleware Stack Diagram

Every HTTP request passes through these layers in order:

```
Client (Browser)
    │
    ▼
┌───────────────────────────────────────────┐
│  Layer 1: Uvicorn ASGI Server             │
│  ────────────────────────────────────     │
│  • Accepts TCP connections on :8000       │
│  • Parses raw HTTP into ASGI scope        │
│  • Manages WebSocket upgrade              │
│  • Hot-reload watcher (--reload flag)     │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Layer 2: CORSMiddleware                  │
│  ────────────────────────────────────     │
│  • Handles preflight OPTIONS requests     │
│  • Adds Access-Control-* headers          │
│  • Allows http://localhost:5173 origin    │
│  • Runs BEFORE any route matching         │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Layer 3: Starlette ExceptionMiddleware   │
│  ────────────────────────────────────     │
│  • Catches unhandled exceptions           │
│  • Routes to registered exception handlers│
│  • IntelligenceError → custom JSON        │
│  • Exception → global fallback JSON       │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Layer 4: Route Matching                  │
│  ────────────────────────────────────     │
│  • Matches URL to registered handler      │
│  • Resolves path parameters               │
│  • Runs Depends() dependency injection    │
│  • Validates request body via Pydantic    │
└───────────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────┐
│  Layer 5: Route Handler                   │
│  ────────────────────────────────────     │
│  • Your actual endpoint code              │
│  • Returns JSON / SSE / WebSocket         │
└───────────────────────────────────────────┘
```

---

## CORS Middleware

### What It Does

CORS (Cross-Origin Resource Sharing) is a browser security mechanism. When the frontend at `http://localhost:5173` makes a `fetch()` request to the backend at `http://localhost:8000`, the browser considers this a **cross-origin request** (different ports = different origins). Without CORS headers, the browser **blocks the response**.

### Configuration

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Parameter Breakdown

| Parameter | Value | What It Means |
|---|---|---|
| `allow_origins` | `["http://localhost:5173", "http://127.0.0.1:5173"]` | Only these two origins are allowed. Any other origin (e.g., a deployed frontend on `https://example.com`) will be blocked. Both `localhost` and `127.0.0.1` are included because some systems resolve differently. |
| `allow_credentials` | `True` | Cookies and auth headers are forwarded. Not currently used (no auth), but prevents issues if cookies are added later. |
| `allow_methods` | `["*"]` | All HTTP methods allowed: GET, POST, PATCH, DELETE, OPTIONS, PUT, HEAD. |
| `allow_headers` | `["*"]` | All request headers are accepted. This includes `Content-Type`, `Authorization`, and any custom headers. |

### Preflight Behavior

For non-simple requests (POST with JSON body, PATCH, DELETE), the browser sends an `OPTIONS` preflight request first:

```
Browser → OPTIONS /api/v1/github/sync
         Origin: http://localhost:5173
         Access-Control-Request-Method: POST

Server  → 200 OK
         Access-Control-Allow-Origin: http://localhost:5173
         Access-Control-Allow-Methods: *
         Access-Control-Allow-Headers: *

Browser → POST /api/v1/github/sync  (actual request proceeds)
```

The `CORSMiddleware` handles the `OPTIONS` response automatically — no route handler code needed.

### Adding a New Frontend Origin

If you deploy the frontend to a different domain:

```python
allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://openissue.example.com",  # Add your domain
]
```

Or for development convenience (but never in production):
```python
allow_origins=["*"]  # ⚠️ Allows ANY origin
```

---

## Exception Handler Middleware

### How FastAPI Exception Handlers Work

Exception handlers are registered with `app.add_exception_handler()`. They act as middleware: when any route handler raises an exception of the registered type, FastAPI intercepts it **before** the default error page would render, and your handler produces the response instead.

### Handler 1: IntelligenceError

```python
class IntelligenceError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code

async def intelligence_exception_handler(request: Request, exc: IntelligenceError):
    log.error(f"Intelligence processing failed: {exc.message} for path {request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.message}}
    )
```

**Purpose:** Domain-specific exception for AI pipeline failures (embedding crash, FAISS corruption, Groq API error). Allows route handlers to raise a semantically named exception that gets a structured JSON response.

**Example usage in a handler:**
```python
raise IntelligenceError("FAISS index corrupted: dimension mismatch", status_code=500)
```

**Response produced:**
```json
HTTP 500
{"error": {"code": 500, "message": "FAISS index corrupted: dimension mismatch"}}
```

### Handler 2: Global Exception Handler

```python
async def global_exception_handler(request: Request, exc: Exception):
    log.critical(f"Unhandled system fault: {str(exc)} on path {request.url.path}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": 500, "message": "An unexpected system fault occurred."}}
    )
```

**Purpose:** Absolute last line of defense. Catches **every** exception that no other handler matched. Without this, FastAPI would return an HTML error page which breaks the frontend's `response.json()` call.

**Critical details:**
- Logs with `log.critical` + `exc_info=True` — full traceback goes to stdout/`backend.log`
- Returns a **generic** message to the client — never leaks internal details (file paths, stack traces, variable names) to the caller
- This is a security pattern: even though the API is local-only today, generic error messages are a good habit

### Why Two Handlers?

Separation of concerns:

| Handler | Matches | Log Level | Response Detail |
|---|---|---|---|
| `IntelligenceError` | AI pipeline failures you explicitly raise | `ERROR` | Specific message you wrote |
| Global | Everything else (DB error, import crash, OOM) | `CRITICAL` | Generic "system fault" |

The `IntelligenceError` handler exists so that expected AI failures (model timeout, Groq rate limit) don't get logged at `CRITICAL` with a full stack trace — they're expected and handled gracefully.

---

## Startup Event Middleware

### What It Does

FastAPI's `@app.on_event("startup")` runs **once** when the server boots, before accepting any requests. It's middleware in the temporal sense — it preprocesses the system state.

### Implementation

```python
@app.on_event("startup")
async def startup_event():
    log.info("Booting Intelligence Pipeline...")
    try:
        from src.db.models import SessionLocal, SyncState
        db = SessionLocal()
        try:
            stuck = db.query(SyncState).filter(SyncState.status == "syncing").all()
            if stuck:
                for s in stuck:
                    log.warning(f"[startup] Found crashed sync for '{s.repo_name}', marking failed.")
                    s.status = "failed"
                    s.last_error = "Server restarted while sync was in progress"
                db.commit()
        finally:
            db.close()
    except Exception as e:
        log.warning(f"[startup] Could not run sync recovery: {e}")
```

### What Problem This Solves

Without this recovery:
1. User triggers sync for `facebook/react`
2. `SyncState.status` is set to `"syncing"` in SQLite
3. Server crashes or is killed (`Ctrl+C`, OOM, deploy restart)
4. Server restarts
5. `SyncState.status` is **still** `"syncing"` in the DB
6. WebSocket reports `is_syncing: true` forever
7. Frontend shows a perpetually spinning progress bar
8. User can never trigger a new sync (the lock thinks one is already running)

With recovery: on boot, any `"syncing"` rows are flipped to `"failed"`, and the frontend can show "Last sync interrupted — click to retry."

### Error Handling

The startup handler catches **all** exceptions and logs a warning rather than crashing. This means if the database doesn't exist yet (first boot), or SQLAlchemy can't connect, the server still starts. The `/health` endpoint will be available, and the user can debug via logs.

---

## Implicit Middleware (FastAPI Built-in)

These are middleware layers you don't see in the source code but that FastAPI/Starlette/Uvicorn apply automatically:

### 1. Request Body Parsing

For `POST`/`PATCH` endpoints with a Pydantic `BaseModel` parameter:
```python
async def sync_repository(request_data: SyncRequest, ...):
```

FastAPI automatically:
1. Reads the raw bytes from the request body
2. Parses as JSON
3. Validates against `SyncRequest` (Pydantic)
4. Returns `422 Unprocessable Entity` if validation fails
5. Injects the validated object as `request_data`

### 2. Dependency Injection (`Depends`)

```python
async def some_route(db: Session = Depends(get_db)):
```

FastAPI's DI system:
1. Calls `get_db()` — a generator that yields a SQLAlchemy `Session`
2. Passes the `Session` to the route handler
3. After the handler returns (or raises), calls `next()` on the generator to hit the `finally` block
4. `finally: db.close()` runs automatically — the session is always cleaned up

This is middleware in disguise — it wraps every request with session lifecycle management.

### 3. Path Parameter Parsing

```python
@router.get("/cluster/{id}")
async def get_cluster_detail(id: int, ...):
```

FastAPI automatically:
1. Extracts `id` from the URL path
2. Casts to `int` (the type hint)
3. Returns `422` if the path segment is not a valid integer

### 4. Query Parameter Parsing

```python
async def list_issues(repo: str, limit: int = 100, ...):
```

FastAPI automatically:
1. Reads `?repo=...&limit=...` from the URL
2. Casts to declared types
3. Applies defaults for missing optional params
4. Returns `422` if required params are missing

### 5. Response Serialization

When a route handler returns a `dict`, FastAPI:
1. Serializes it to JSON via `json.dumps()`
2. Sets `Content-Type: application/json`
3. Sends the response

When the return type is a Pydantic `response_model`, it additionally validates the output and strips any extra fields.

---

## Frontend "Middleware" Patterns

React doesn't have middleware in the traditional sense, but OpenIssue uses patterns that serve the same purpose:

### 1. ErrorBoundary (Component-Level Catch-All)

```jsx
class ErrorBoundary extends React.Component {
    componentDidCatch(error, info) {
        this.setState({ hasError: true });
    }
    render() {
        if (this.state.hasError) return <fallback UI>;
        return this.props.children;
    }
}
```

Wraps the entire Dashboard. Any render error in any child component is caught here instead of crashing the whole page to a white screen.

### 2. Fetch Error Handling Pattern

Every API call follows this implicit middleware chain:

```js
fetch(url)
    .then(r => {
        if (!r.ok) throw new Error(r.status);  // ← "middleware": status check
        return r.json();                        // ← "middleware": JSON parse
    })
    .then(data => setState(data))              // ← handler
    .catch(err => setError(String(err)));       // ← error handler
```

### 3. AbortController (Request Cancellation)

```js
useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal });
    return () => controller.abort();  // Cancel on unmount
}, []);
```

This is middleware for preventing stale responses: if the user navigates away before the fetch completes, the request is aborted and no state update occurs (preventing React "setState on unmounted component" warnings).

---

## What's Missing (And Why)

| Middleware | Status | Reason |
|---|---|---|
| **Authentication** | Not implemented | Local-only tool. Adding OAuth or API key middleware is the top priority before any network exposure. |
| **Rate Limiting** | Not implemented | Single user, localhost. The Groq API has its own rate limits that are handled per-call. |
| **Request Logging** | Not implemented as middleware | Logging happens inside handlers via `log.info()`. A proper access-log middleware (method, path, status, duration) would improve debugging. |
| **Compression (gzip)** | Not implemented | Data payloads are small (< 1MB). SSE streams are text. Compression would add latency for minimal size reduction. |
| **Request ID Tracking** | Not implemented | No X-Request-ID header is generated or propagated. For distributed tracing, this would be essential — not needed for a single-process app. |
| **CSRF Protection** | Not needed | No cookie-based auth = no CSRF attack surface. CORS is sufficient. |
