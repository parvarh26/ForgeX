# OpenIssue — Security Documentation

> **Part 6 of 7** | Covers every security consideration, threat model, and hardening measure in the system

---

## Table of Contents

1. [Security Posture Summary](#security-posture-summary)
2. [Threat Model](#threat-model)
3. [What Is Protected](#what-is-protected)
4. [What Is NOT Protected](#what-is-not-protected)
5. [Authentication & Authorization](#authentication--authorization)
6. [Secrets Management](#secrets-management)
7. [Input Validation](#input-validation)
8. [SSRF Prevention](#ssrf-prevention)
9. [SQL Injection Prevention](#sql-injection-prevention)
10. [XSS Prevention](#xss-prevention)
11. [CORS Configuration](#cors-configuration)
12. [Data Persistence Security](#data-persistence-security)
13. [Dependency Security](#dependency-security)
14. [Network Exposure](#network-exposure)
15. [Security Hardening Checklist](#security-hardening-checklist)

---

## Security Posture Summary

**OpenIssue is designed as a localhost-only development tool.** It has no authentication, no authorization, no rate limiting, and no encryption at rest. This is not an oversight — it's a deliberate scope decision for a 24-hour hackathon project that processes only public GitHub data.

**But "localhost-only" does not mean "zero security."** The system still handles:
- A GitHub Personal Access Token with repository read scope
- A Groq API key with billing implications
- A FAISS index that could be probed for information about private repos (if used with one)

This document is honest about what's protected, what's not, and exactly what you need to do before exposing this to any network.

---

## Threat Model

### Who Are the Users?

A single developer or maintainer running the tool on their own machine. There is no multi-tenancy.

### What Are the Assets?

| Asset | Sensitivity | Storage |
|---|---|---|
| GitHub PAT (`GITHUB_TOKEN`) | **HIGH** — can read/write repos depending on scope | `.env` file on disk, process memory |
| Groq API Key (`GROQ_API_KEY`) | **MEDIUM** — billing implications | `.env` file on disk, process memory |
| Issue data (titles, bodies) | **LOW** — public repos only by default | SQLite `openissue.db` |
| FAISS vector index | **LOW** — derived from public data | `storage/vector_indices/*.index` |
| Triage annotations | **LOW** — local notes, not synced to GitHub | SQLite `issue_triage` table |

### Attack Surface

| Vector | Risk if > localhost | Current Mitigation |
|---|---|---|
| Unauthenticated API access | **CRITICAL** — anyone can read/delete all data | None — no auth |
| SSRF via `/raw` proxy | **HIGH** — server-side requests to arbitrary URLs | URL prefix check (partial) |
| SQLite file access | **MEDIUM** — direct file read bypasses all controls | OS-level file permissions only |
| Dependency vulnerabilities | **MEDIUM** — PyTorch/FAISS/httpx supply chain | Manual `pip` updates only |
| WebSocket abuse | **LOW** — unauthenticated persistent connection | Graceful disconnect, no write operations via WS |

---

## What Is Protected

### 1. Error Messages Don't Leak Internals

The global exception handler returns a generic message:
```json
{"error": {"code": 500, "message": "An unexpected system fault occurred."}}
```

Never exposes: file paths, stack traces, database schema, Python version, or internal variable names. Even in a local tool, this prevents information disclosure if someone screenshots an error.

### 2. SSRF Partial Protection on `/raw` Proxy

```python
@router.get("/raw")
async def proxy_github_raw(url: str):
    if not url.startswith("https://raw.githubusercontent.com"):
        raise HTTPException(status_code=400, detail="Only raw.githubusercontent.com URLs are allowed.")
```

Only allows fetching from GitHub's raw content CDN. Prevents an attacker from using the server as an open proxy to reach internal services (e.g., `http://169.254.169.254/` for cloud metadata).

### 3. SQLAlchemy Parameterized Queries

All database access goes through SQLAlchemy ORM, which uses parameterized queries internally:
```python
db.query(IssueModel).filter(IssueModel.repo_name == repo).all()
```

This generates: `SELECT * FROM issues WHERE repo_name = ?` with the parameter bound safely. SQL injection via the `repo` query parameter is not possible.

### 4. Atomic FAISS Writes

```python
# Write to temp file first
faiss.write_index(self.index, tmp_index)
# Atomic rename — if crash happens before this, original index is intact
os.replace(tmp_index, self.index_file)
```

Prevents index corruption from process crashes during write. Not a security measure per se, but prevents a denial-of-service via corrupted data.

### 5. SQLite WAL Mode + Foreign Keys

```python
cursor.execute("PRAGMA journal_mode=WAL")
cursor.execute("PRAGMA foreign_keys=ON")
```

WAL mode prevents database corruption from concurrent reads/writes. Foreign keys enforce referential integrity.

### 6. Unique Constraints Prevent Data Duplication

```python
UniqueConstraint("repo_name", "github_issue_id", name="uq_repo_issue")
UniqueConstraint("repo_name", "issue_number", name="uq_repo_triage")
UniqueConstraint("repo_name", name="uq_syncstate_repo")
```

Prevents double-click or concurrent sync from creating duplicate rows. This is a data integrity measure that also prevents denial-of-service via database bloat.

---

## What Is NOT Protected

### 1. No Authentication — Zero

There is no API key, no OAuth, no JWT, no session cookie, no basic auth. Every endpoint is fully public to anyone who can reach port 8000.

**Impact:** If the server is exposed to a network (even a local coffee shop WiFi), any device on that network can:
- Read all issue data: `GET /api/v1/issues/`
- Delete all data for any repo: `DELETE /api/v1/github/repo?repo=facebook/react`
- Trigger syncs: `POST /api/v1/github/sync`
- Access system internals: `GET /api/v1/system/status`

### 2. No Authorization — No Roles

Even if auth were added, there are no role checks. There's no concept of "this user can view but not delete." All operations are available to all callers.

### 3. No Rate Limiting

No request throttling on any endpoint. An attacker could:
- Exhaust the GitHub PAT's 5,000 req/hr limit by spamming `/issue/{number}` (each call hits GitHub's API)
- Exhaust the Groq API quota by spamming `/ai/search`
- OOM the server by triggering `/spatial` on multiple large repos simultaneously

### 4. No HTTPS

The server runs on plain HTTP:
```
http://localhost:8000
```

The GitHub token in `.env` is never transmitted over the wire (it stays server-side), so this is acceptable for localhost. But if deployed behind a reverse proxy without TLS, the SSE and WebSocket streams would be in cleartext.

### 5. No Encryption at Rest

- `openissue.db` is a plain SQLite file — readable by any process with file access
- `.env` contains API keys in plaintext
- FAISS index files are unencrypted binary

### 6. GitHub Token in Frontend `sessionStorage`

The login page stores the user-entered GitHub token in `sessionStorage.gh_token`. While `sessionStorage` is not accessible cross-origin and is wiped on tab close, it is accessible to any JavaScript running on the same origin — including browser extensions and XSS payloads.

The token is **not actually used** by the frontend (the backend has its own token), so this is currently a cosmetic concern. But if the frontend starts forwarding the user's token to the backend, this becomes a real vulnerability.

---

## Authentication & Authorization

### Current State

None. Intentionally.

### Recommended Implementation Path

For **local multi-user** (e.g., team on a LAN):
```python
# Simple API key middleware
from fastapi import Security
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != settings.API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

# Apply to a route:
@router.post("/sync")
async def sync_repository(..., api_key: str = Depends(verify_api_key)):
```

For **public deployment**:
- GitHub OAuth flow (already stubbed in `GithubLogin.jsx`)
- JWT tokens with expiry
- Role-based access: `viewer` (read-only), `maintainer` (read/write/triage), `admin` (delete/purge)

---

## Secrets Management

### Where Secrets Live

| Secret | File | Format |
|---|---|---|
| `GITHUB_TOKEN` | `backend/.env` | `GITHUB_TOKEN=github_pat_...` |
| `GROQ_API_KEY` | `backend/.env` | `GROQ_API_KEY=gsk_...` |

### How Secrets Are Loaded

Pydantic `BaseSettings` reads from the `.env` file at process startup:
```python
class Settings(BaseSettings):
    LLM_API_KEY: str = ""
    model_config = SettingsConfigDict(env_file=".env")
```

Secrets are stored in `settings` object attributes — available in process memory for the lifetime of the server.

### Git Protection

The `.gitignore` file **must** contain:
```
backend/.env
*.db
storage/
```

If `.env` is accidentally committed, the GitHub token should be rotated immediately via GitHub Settings → Developer settings → Personal access tokens.

### Rotation

There is no secret rotation mechanism. To rotate:
1. Generate a new token on GitHub / Groq
2. Update `backend/.env`
3. Restart the server (`Ctrl+C` on `start-all.sh`, re-run)

---

## Input Validation

### Pydantic Request Validation

All POST/PATCH bodies are validated via Pydantic models:

```python
class SyncRequest(BaseModel):
    repo: str  # Must be a string, FastAPI returns 422 if missing

class SearchRequest(BaseModel):
    repo: str
    query: str

class TriagePayload(BaseModel):
    priority: str | None = None
    # ... all fields optional
```

If the body is malformed JSON, missing required fields, or has wrong types — FastAPI returns `422` automatically before the handler runs.

### Path Parameter Type Enforcement

```python
@router.get("/cluster/{id}")
async def get_cluster_detail(id: int, ...):
```

`id: int` means FastAPI will reject `/cluster/abc` with a `422`. Only valid integers pass through.

### What Is NOT Validated

- **`repo` format** is not validated on the backend. `repo=!!!invalid!!!` will be passed to the GitHub API, which will return a 404. The backend propagates this error. There is no regex check for `owner/repo` format server-side (the frontend does a basic check).
- **`query` length** for AI search is not limited. A 100KB query string would be embedded by MiniLM (which truncates at 256 tokens internally) and passed to Groq (which has its own token limits). No explicit server-side length check.
- **`url` parameter** on `/raw` only checks prefix, not URL structure. `https://raw.githubusercontent.com/../../../etc/passwd` would be sent to GitHub's CDN (which would 404), not to the local filesystem.

---

## SSRF Prevention

### Protected Endpoint: `GET /api/v1/github/raw`

```python
if not url.startswith("https://raw.githubusercontent.com"):
    raise HTTPException(status_code=400, ...)
```

This prevents the most dangerous SSRF pattern: using an open proxy to reach internal services.

### Vulnerable Pattern: `GET /api/v1/github/contents`

The `contents` endpoint constructs a GitHub API URL from user input:
```python
url = f"https://api.github.com/repos/{repo}/contents/{path}"
```

The `repo` and `path` parameters are interpolated directly. While the resulting URL always starts with `https://api.github.com/repos/`, a malicious `repo` like `../../` could theoretically manipulate the URL path. In practice, `httpx` normalizes URLs and GitHub returns 404 for invalid repos.

### Not Protected: No egress firewall

The server can make outbound HTTP requests to any URL via `httpx`. The SSRF protection is endpoint-specific, not system-wide. If a new proxy endpoint is added without the URL check, it becomes an open SSRF vector.

---

## SQL Injection Prevention

**Fully protected by SQLAlchemy ORM.**

Every database query uses the ORM's query builder:
```python
db.query(IssueModel).filter(IssueModel.repo_name == repo).all()
```

This is compiled to:
```sql
SELECT * FROM issues WHERE repo_name = ?
```

The `?` is a bound parameter — the database engine handles escaping. There are **no raw SQL strings** anywhere in the codebase.

There is one potential concern: the `github_issue_numbers` field stores comma-separated integers as a string. It's split with `.split(",")` and filtered with `.isdigit()`:
```python
nums = [int(n) for n in (c.github_issue_numbers.split(",") if c.github_issue_numbers else []) if n.strip().isdigit()]
```

The `.isdigit()` check prevents non-numeric values from being processed. Even without it, SQL injection wouldn't be possible because the values are used in `IssueModel.github_issue_id.in_(nums)` — still parameterized.

---

## XSS Prevention

### Backend: Not Applicable

The backend serves JSON only — no HTML rendering. XSS is a browser-side concern.

### Frontend: React's Default Protection

React escapes all string interpolation in JSX by default:
```jsx
<span>{issue.title}</span>
```

Even if `issue.title` contains `<script>alert(1)</script>`, React renders it as text, not HTML.

### Frontend: Markdown Rendering Risk

`IssueDetail.jsx` uses `react-markdown` to render issue bodies:
```jsx
<ReactMarkdown remarkPlugins={[remarkGfm]}>{issue.body}</ReactMarkdown>
```

`react-markdown` is safe by default — it does not render raw HTML tags. It converts markdown syntax to React elements. However, `remarkGfm` adds support for tables and autolinks, which is safe.

If `rehype-raw` were ever added (it's not), raw HTML in issue bodies would be rendered and XSS would be possible.

### Frontend: `dangerouslySetInnerHTML`

A search of the codebase shows **no usage of `dangerouslySetInnerHTML`**. This is the most common React XSS vector and it's completely absent.

---

## CORS Configuration

See the [Middleware Documentation](./05_middleware.md#cors-middleware) for full details.

**Summary:** Only `http://localhost:5173` and `http://127.0.0.1:5173` are allowed origins. This prevents malicious websites from making API calls to the backend (even if the user has the backend running).

**Limitation:** If the user visits a malicious page at `http://localhost:5173` (same port as the legit frontend), CORS provides no protection. This is a theoretical concern — in practice, port 5173 will be occupied by the Vite dev server.

---

## Data Persistence Security

### SQLite Database (`openissue.db`)

- **Location:** Project root (`backend/` working directory)
- **Permissions:** Inherits user's umask (typically `0644` — readable by all users on the machine)
- **Encryption:** None (plaintext)
- **Contents:** Issue titles, bodies, cluster insights, triage notes, sync state
- **WAL files:** `openissue.db-wal` and `openissue.db-shm` may contain uncommitted data

### FAISS Index Files (`storage/vector_indices/`)

- **Location:** `backend/storage/vector_indices/`
- **Format:** Binary FAISS index (not human-readable but extractable)
- **Exposure:** Vector embeddings can be reverse-engineered to approximate original text using model inversion attacks. For public repo data, this is not a concern. For private repo data, this is a data leak.

### Environment File (`.env`)

- **Location:** `backend/.env`
- **Contains:** API keys in plaintext
- **Must be in .gitignore:** Verified present in project `.gitignore`

---

## Dependency Security

### Python Dependencies

The system depends on large packages with deep dependency trees:

| Package | Risk Surface | Notes |
|---|---|---|
| `torch` / `sentence-transformers` | Very large (800MB+), C extensions | Maintained by Meta/Hugging Face. Pin versions in `requirements.txt`. |
| `faiss-cpu` | C++ native code | Maintained by Meta FAIR. Well-audited. |
| `httpx` | Makes outbound HTTP requests | Used for GitHub and Groq API calls. |
| `psutil` | Reads system metrics | Low risk. |
| `scikit-learn` | Numerical computing | Well-maintained. |

### Frontend Dependencies

| Package | Risk Surface |
|---|---|
| `react`, `react-dom` | Maintained by Meta. Low risk. |
| `react-markdown` | Markdown-to-React conversion. Safe by default. |
| `react-syntax-highlighter` | Renders code blocks. Uses PrismJS internally. |

### Recommended Actions

```bash
# Check for known vulnerabilities in Python deps
pip audit

# Check frontend deps
cd frontend && npm audit
```

No automated vulnerability scanning is configured.

---

## Network Exposure

### Default Configuration: Localhost Only

```python
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Wait — `0.0.0.0` is NOT localhost-only.** The `--host 0.0.0.0` flag binds to **all network interfaces**, meaning:
- `localhost:8000` ✅
- `192.168.1.x:8000` ✅ (any device on the LAN can reach it)
- Public IP:8000 ✅ (if no firewall)

**This is a misconfiguration for a "localhost-only" tool.** To truly restrict to localhost:
```python
uvicorn main:app --host 127.0.0.1 --port 8000
```

### To Fix

In `start-all.sh`, change:
```bash
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
to:
```bash
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

And in `main.py`:
```python
uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
```

---

## Security Hardening Checklist

Before any non-localhost deployment:

| # | Action | Priority | Status |
|---|---|---|---|
| 1 | Change Uvicorn `--host` from `0.0.0.0` to `127.0.0.1` | 🔴 Critical | ❌ Not done |
| 2 | Add API key or OAuth authentication middleware | 🔴 Critical | ❌ Not done |
| 3 | Add HTTPS via reverse proxy (nginx/Caddy) | 🔴 Critical | ❌ Not done |
| 4 | Verify `.env` is in `.gitignore` | 🟡 High | ✅ Done |
| 5 | Add rate limiting on `/ai/search` and `/issue/:number` | 🟡 High | ❌ Not done |
| 6 | Validate `repo` format server-side (regex: `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$`) | 🟡 High | ❌ Not done |
| 7 | Add request body size limits | 🟡 High | ❌ Not done |
| 8 | Pin all Python dependency versions | 🟢 Medium | Partial |
| 9 | Run `pip audit` and `npm audit` in CI | 🟢 Medium | ❌ Not done |
| 10 | Remove `DELETE /api/v1/github/repo` or gate behind admin auth | 🟢 Medium | ❌ Not done |
| 11 | Add structured access logging middleware | 🟢 Medium | ❌ Not done |
| 12 | Encrypt SQLite at rest (SQLCipher) or migrate to PostgreSQL with TLS | 🔵 Low | ❌ Not done |
| 13 | Add Content Security Policy headers | 🔵 Low | ❌ Not done |
