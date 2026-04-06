# OpenIssue — Routing Documentation

> **Part 4 of 7** | Covers both frontend client-side routing and backend server-side routing

---

## Table of Contents

1. [Routing Overview](#routing-overview)
2. [Frontend Routing (React Router v6)](#frontend-routing-react-router-v6)
3. [Backend Routing (FastAPI APIRouter)](#backend-routing-fastapi-apirouter)
4. [Data Flow Per Route](#data-flow-per-route)
5. [Navigation Patterns](#navigation-patterns)
6. [Route Guards & Edge Cases](#route-guards--edge-cases)

---

## Routing Overview

OpenIssue has **two completely separate routing systems** that work together:

```
Browser URL bar
    │
    ▼
React Router v6 (client-side, in-browser)
    │  Decides which React component to render
    │  Never hits the server for page navigation
    │
    ▼
Component mounts → calls fetch()
    │
    ▼
FastAPI APIRouter (server-side, Python)
    │  Handles API data requests only
    │  Never serves HTML pages
    │
    ▼
Returns JSON → component renders it
```

**The frontend is a Single Page Application.** The browser loads `index.html` once. React Router intercepts all URL changes and swaps components in-place. The server never sees page navigation requests — it only receives API calls from `fetch()`.

**The backend is a pure API server.** It has no HTML templates, no server-side rendering, no page routes. Every route returns JSON (or SSE/WebSocket streams).

---

## Frontend Routing (React Router v6)

### Route Definitions

All routes are defined in a single file: `frontend/src/App.jsx`

```jsx
<Routes>
  <Route path="/"                                    element={<Landing />} />
  <Route path="/login"                               element={<GithubLogin />} />
  <Route path="/select-repo"                         element={<RepoSelect />} />
  <Route path="/dashboard"                           element={<Dashboard />} />
  <Route path="/dashboard/:owner/:repoName"          element={<Dashboard />} />
  <Route path="/cluster/:id"                         element={<ClusterDetail />} />
  <Route path="/cluster/:owner/:repoName/:id"        element={<ClusterDetail />} />
  <Route path="/issue/:owner/:repoName/:number"      element={<IssueDetail />} />
  <Route path="/search"                              element={<SearchResults />} />
</Routes>
```

### Route-by-Route Breakdown

#### `/` → `Landing`

The first thing a user sees. Static marketing page. No data fetching.

**Navigation out:** "Get Started" button → `navigate('/login')`

---

#### `/login` → `GithubLogin`

GitHub token entry form. Stores token in `sessionStorage.gh_token`.

**Navigation out:** Submit → `navigate('/select-repo')`

---

#### `/select-repo` → `RepoSelect`

User types `owner/repo` or clicks a pre-set chip.

What happens on selection:
1. `sessionStorage.setItem('openissue_repo', 'facebook/react')`
2. `navigate('/dashboard')`

**This is the only place where the active repo is set.** Every downstream page reads from `sessionStorage`.

---

#### `/dashboard` → `Dashboard`

The main application shell. Contains 5 tabs rendered as internal views (not separate routes):

| Tab | Internal renderer | Component |
|---|---|---|
| Intelligence | `renderIntelligence()` | Inline function |
| Code | `<RepoBrowser />` | Inline sub-component |
| Spatial Matrix | `<SpatialMatrixView />` | Separate file import |
| Vector Index | `<VectorIndexView />` | Separate file import |
| Backend Status | `<BackendStatusView />` | Exported from VectorIndexView |

**Tab switching does NOT change the URL.** Tabs are managed by `useState('Intelligence')`. This means:
- Refreshing the page always returns to the Intelligence tab
- You cannot deep-link to a specific tab (e.g., no `/dashboard?tab=spatial`)
- Browser back/forward does not navigate between tabs

---

#### `/dashboard/:owner/:repoName` → `Dashboard`

Same component as `/dashboard`. The `:owner` and `:repoName` params exist for shareable URLs but are **not authoritative** — the component still reads from `sessionStorage`. If you navigate directly to `/dashboard/torvalds/linux` but `sessionStorage` says `facebook/react`, you see React's data.

---

#### `/cluster/:id` → `ClusterDetail`

Legacy route for backward compatibility. `:id` is the DBSCAN cluster label integer.

**Data source:** `GET /api/v1/github/cluster/{id}?repo={sessionStorage.openissue_repo}`

---

#### `/cluster/:owner/:repoName/:id` → `ClusterDetail`

Canonical cluster route. `:owner/:repoName` determines the repo (used instead of sessionStorage here). `:id` is the cluster label.

**Navigation out:** Click an issue → `navigate('/issue/:owner/:repoName/:number')`

---

#### `/issue/:owner/:repoName/:number` → `IssueDetail`

Full issue page. All three params are used:
- `:owner/:repoName` → constructs the `repo` string for API calls
- `:number` → the GitHub issue number

**Data sources (two parallel fetches on mount):**
1. `GET /api/v1/github/issue/{number}?repo={owner}/{repoName}`
2. `GET /api/v1/github/triage/{number}?repo={owner}/{repoName}`

---

#### `/search` → `SearchResults`

Uses query string parameters (not path params):
- `?repo=facebook/react` → which repo to search
- `?q=hydration errors` → the search query

**Data source:** `POST /api/v1/ai/search` with `{ repo, query }`

**Navigation in:** From `CommandPalette` in Dashboard header (press Enter on search bar or `/` shortcut).

---

### 404 Handling

**There is no catch-all 404 route.** If a user navigates to `/nonexistent`, React Router renders nothing (blank page with the base HTML shell). The `ErrorBoundary` in Dashboard only catches render errors, not missing routes.

---

## Backend Routing (FastAPI APIRouter)

### Router Mounting

All routers are mounted in `backend/main.py` with versioned prefixes:

```python
app.include_router(issues.router,   prefix="/api/v1/issues",   tags=["Issues"])
app.include_router(clusters.router, prefix="/api/v1/clusters", tags=["Clusters"])
app.include_router(github.router,   prefix="/api/v1/github",   tags=["GitHub"])
app.include_router(ai_search.router,prefix="/api/v1/ai",       tags=["AI Search"])
app.include_router(system.router,   prefix="/api/v1/system",   tags=["System"])
```

Plus one root-level route:
```python
@app.get("/health")
```

### Route Resolution Order

FastAPI matches routes **top-to-bottom within each router**, and routers are checked **in mounting order**. Within `github.py`:

1. `GET /verify` (exact match)
2. `POST /sync` (exact match)
3. `GET /cluster/{id}` (parameterized)
4. `DELETE /cluster/{cluster_id}/issue/{issue_number}` (nested params)
5. `POST /cluster/{cluster_id}/reanalyze` (nested params)
6. `GET /triage/{issue_number}` (parameterized)
7. `PATCH /triage/{issue_number}` (parameterized)
8. `GET /issue/{number}` (parameterized)
9. `DELETE /repo` (exact match)
10. `GET /contents` (exact match)
11. `GET /raw` (exact match)
12. `GET /spatial` (exact match)
13. `GET /vector-stats` (exact match)
14. `WS /ws/sync/{repo:path}` (WebSocket, path-capturing)

**The WebSocket route uses `{repo:path}`** — a special FastAPI syntax that captures slashes. This lets `ws://localhost:8000/api/v1/github/ws/sync/facebook/react` pass `facebook/react` as the `repo` parameter (not two separate path segments).

### Route Files and Their Responsibilities

| File | Prefix | # Routes | Responsibility |
|---|---|---|---|
| `github.py` | `/api/v1/github` | 14 | Sync, clusters, triage, issue detail, code proxy, spatial, stats, WebSocket |
| `issues.py` | `/api/v1/issues` | 2 | List issues (GET), manual ingest (POST) |
| `ai_search.py` | `/api/v1/ai` | 1 | Semantic search |
| `clusters.py` | `/api/v1/clusters` | 1 | Legacy live clustering |
| `system.py` | `/api/v1/system` | 1 | System telemetry |

**`github.py` is the monolith.** At 867 lines, it handles 14 endpoints that should arguably be split into 3-4 separate routers (sync, clusters, triage, proxy). This is a known tech debt from the 24-hour hackathon origin.

---

## Data Flow Per Route

### Full navigation flow: Landing → Issue Detail

```
User lands on /
    │ clicks "Get Started"
    ▼
/login
    │ enters GitHub token, clicks Submit
    ▼
/select-repo
    │ types "facebook/react", clicks Connect
    │ sessionStorage.openissue_repo = "facebook/react"
    ▼
/dashboard
    │ Component mounts:
    │   1. POST /api/v1/github/sync {"repo":"facebook/react"}  → SSE stream starts
    │   2. WS ws://localhost:8000/api/v1/github/ws/sync/facebook/react  → progress feed
    │   3. Clusters stream in via SSE → rendered in Intelligence tab
    │
    │ User clicks on a cluster row
    ▼
/cluster/facebook/react/42
    │ GET /api/v1/github/cluster/42?repo=facebook/react
    │ Renders cluster insight + issue list
    │
    │ User clicks on issue #9046
    ▼
/issue/facebook/react/9046
    │ Parallel:
    │   1. GET /api/v1/github/issue/9046?repo=facebook/react  (live from GitHub)
    │   2. GET /api/v1/github/triage/9046?repo=facebook/react (local triage data)
    │ Renders full issue with AI triage panel
```

### Full search flow

```
User is on /dashboard, presses "/" to focus search bar
    │ types "hydration errors in SSR", presses Enter
    ▼
/search?repo=facebook%2Freact&q=hydration%20errors%20in%20SSR
    │ POST /api/v1/ai/search {"repo":"facebook/react","query":"hydration errors in SSR"}
    │   → Embeds query → FAISS top-5 → Groq LLM → synthesized answer
    │ Renders answer + source issue chips
```

---

## Navigation Patterns

### Programmatic Navigation

All navigation uses React Router's `useNavigate()` hook:

```jsx
const navigate = useNavigate();

// Direct route
navigate('/dashboard');

// With path params
navigate(`/cluster/${owner}/${repoName}/${cluster.cluster_label}`);

// With query params
navigate(`/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`);
```

### No `<Link>` Components

The codebase uses `navigate()` programmatically rather than `<Link to="...">`. This is because most navigation is triggered by `onClick` handlers on custom-styled `<div>` elements (not standard anchor tags). The trade-off: no browser-native link features (middle-click to open in new tab, right-click → Copy Link).

### External Links

GitHub issue links are standard `<a>` tags with `target="_blank"`:
```jsx
<a href={`https://github.com/${repo}/issues/${number}`} target="_blank" rel="noopener noreferrer">
```

---

## Route Guards & Edge Cases

### No Authentication Guards

No route is protected. Any URL is accessible without a token. The login page stores a token but nothing checks for it downstream. If you navigate directly to `/dashboard`, it works — defaulting to `facebook/react`.

### Missing Repo Fallback

```js
const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';
```

If no repo is set (user skipped `/select-repo`), the dashboard silently defaults to `facebook/react`. This means a direct visit to `/dashboard` always shows something rather than erroring.

### Direct URL Access

Every route works when accessed directly (not just via navigation). The Vite dev server is configured with SPA fallback — all paths serve `index.html`, and React Router handles the rest client-side.

### Browser Back/Forward

Fully supported between pages (Landing ↔ Login ↔ RepoSelect ↔ Dashboard ↔ ClusterDetail ↔ IssueDetail). Not supported for tab switching within Dashboard (tabs are state, not routes).
