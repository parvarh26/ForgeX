# OpenIssue — Frontend Documentation

> **Part 1 of 7** | Technology: React 18 + Vite + React Router v6

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Layout](#project-layout)
4. [Entry Points](#entry-points)
5. [Routing](#routing)
6. [Pages](#pages)
7. [State Management Philosophy](#state-management-philosophy)
8. [API Communication Layer](#api-communication-layer)
9. [SSE Stream Handling](#sse-stream-handling)
10. [WebSocket Integration](#websocket-integration)
11. [Design System](#design-system)
12. [Local Development](#local-development)
13. [Known Limitations](#known-limitations)

---

## Overview

The OpenIssue frontend is a single-page application (SPA) built with React 18 and Vite. It provides a dark-mode intelligence dashboard for GitHub repository maintainers to explore AI-clustered issues, run semantic search, inspect vector embeddings, and monitor the backend pipeline in real time.

There is **no global state library** (no Redux, no Zustand). All state is local React state + `sessionStorage` for cross-page persistence of the active repo. This is intentional — the UI is data-display-heavy but interaction-light.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| React 18 | UI rendering |
| Vite 5 | Dev server + bundler |
| React Router v6 | Client-side routing |
| react-markdown + remark-gfm | Rendering README and issue bodies |
| react-syntax-highlighter | Code file viewer (VS Code Dark theme) |
| lucide-react | Icon set |
| Canvas 2D API | Spatial Matrix visualization (no chart lib) |

> **No CSS framework.** All styling is inline `style={}` objects with a hand-tuned dark-mode palette. Keeps styles co-located with components.

---

## Project Layout

```
frontend/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx                   # React DOM root, BrowserRouter
    ├── App.jsx                    # Route definitions
    ├── index.css                  # Global resets only
    └── pages/
        ├── Landing.jsx            # Marketing/intro page
        ├── GithubLogin.jsx        # GitHub token entry (UI scaffolding)
        ├── RepoSelect.jsx         # Repo picker + history
        ├── Dashboard.jsx          # Main app shell + all tabs
        ├── ClusterDetail.jsx      # Single cluster deep-dive
        ├── IssueDetail.jsx        # Full issue view + AI triage
        ├── IssuePreviewModal.jsx  # Hover preview modal
        ├── SearchResults.jsx      # Semantic search results
        ├── SpatialMatrixView.jsx  # Canvas PCA scatter plot
        └── VectorIndexView.jsx    # FAISS index telemetry dashboard
```

---

## Entry Points

### `src/main.jsx`
Bootstraps React with `BrowserRouter`. React.StrictMode is disabled to prevent double-invocation of SSE effects in development.

### `src/App.jsx`
All client-side routes defined here. No lazy loading — all pages are eagerly imported.

---

## Routing

| Path | Component | Notes |
|---|---|---|
| `/` | `Landing` | Static hero page |
| `/login` | `GithubLogin` | Token entry, not wired to backend API |
| `/select-repo` | `RepoSelect` | Sets `sessionStorage.openissue_repo` |
| `/dashboard` | `Dashboard` | Reads repo from `sessionStorage` |
| `/dashboard/:owner/:repoName` | `Dashboard` | Direct URL nav (params supplementary) |
| `/cluster/:id` | `ClusterDetail` | Legacy numeric-ID route |
| `/cluster/:owner/:repoName/:id` | `ClusterDetail` | Canonical cluster route |
| `/issue/:owner/:repoName/:number` | `IssueDetail` | Full issue view |
| `/search` | `SearchResults` | Reads `?repo=` and `?q=` from URL |

### Active Repo Persistence

```js
// Written in RepoSelect.jsx on navigation
sessionStorage.setItem('openissue_repo', 'facebook/react');

// Read in Dashboard.jsx
const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';
```

Session-scoped: survives refresh, isolated per tab.

---

## Pages

### `Landing.jsx`
Static page. No API calls. CTA navigates to `/login`.

---

### `GithubLogin.jsx`
Accepts a GitHub Personal Access Token (PAT). Stores it in `sessionStorage` as `gh_token`.
**Important:** The token is not currently forwarded to backend API calls. The backend reads its own `GITHUB_TOKEN` from `.env`. This page is UI scaffolding for a planned OAuth flow.

---

### `RepoSelect.jsx`
- Validates `owner/repo` format before proceeding
- Stores selection in `sessionStorage` and navigates to `/dashboard`
- Shows hardcoded popular repos as quick-select chips

---

### `Dashboard.jsx` — Core Shell

The main application file (~600 lines). Manages:

**Tab system:**
```
Intelligence    → renderIntelligence()  [inline render function]
Code            → <RepoBrowser />       [inline sub-component]
Spatial Matrix  → <SpatialMatrixView />
Vector Index    → <VectorIndexView />
Backend Status  → <BackendStatusView />
```

**Inline sub-components:**

| Name | Purpose |
|---|---|
| `ErrorBoundary` | Class component — catches render errors, prevents black screen |
| `StatusPill` | Header indicator (streaming / complete / error) |
| `ClusterCard` | One row in the Semantic Matrix cluster list |
| `CommandPalette` | Header search bar with `/` keyboard shortcut |
| `RepoBrowser` | GitHub file tree, lazily loads directory contents |

**Key state variables:**

```js
clusters    // Array of cluster objects streamed via SSE
streaming   // Boolean: SSE connection is active
complete    // Boolean: stream ended cleanly
hasError    // Boolean: pipeline emitted an error event
bgSync      // { processed, total_repo, is_syncing } from WebSocket
rawIssues   // Fallback issue list when clusters.length === 0 (small repos)
```

**Zero-cluster fallback:**
When a repo is too small for DBSCAN to form clusters, `fetchRawIssues()` is auto-called 600ms after stream completion. It fetches `GET /api/v1/issues/?repo=` and renders each issue individually with title, number, labels, and state.

---

### `ClusterDetail.jsx`
Fetches `GET /api/v1/github/cluster/:id`. Shows cluster urgency, AI-generated insight, and full issue list. "Re-analyze" button calls `POST /api/v1/github/cluster/:id/reanalyze`.

---

### `IssueDetail.jsx`
Heaviest component (~1400 lines). Renders:
- Issue body as Markdown
- AI triage panel: urgency, root cause, fix suggestion, reproduction steps
- Cluster membership badge (links back to cluster detail)
- Similar issues list from FAISS search
- Comment thread

**Data sources:**
- `GET /api/v1/github/issue/:number?repo=`
- `GET /api/v1/github/triage/:number?repo=`

---

### `IssuePreviewModal.jsx`
Floating modal triggered by "Preview" button on cluster cards. Loads first 5 issues from `GET /api/v1/github/cluster/:id`. Closes on Escape key or backdrop click.

---

### `SearchResults.jsx`
Reads `?repo` and `?q` from query string. Posts to `POST /api/v1/ai/search`. Displays Groq-synthesized answer + source issue cards. Spinner shows during LLM synthesis (2–5s typical).

---

### `SpatialMatrixView.jsx` — Canvas Visualization

PCA 2D projection of all FAISS vectors rendered on `<canvas>`. No charting library.

**Render pipeline (via `requestAnimationFrame`):**
1. Dot-grid background
2. Convex hull territories per cluster (dashed boundary line)
3. Radial glow halos at cluster centroids
4. Noise point layer (muted, r=2.5)
5. Clustered points (bevel-gradient spheres + glow ring)
6. Diamond marker at each centroid

**Interactions:**
- Mouse wheel → focal-point zoom toward cursor position
- Click + drag → pan
- Hover → DPI-corrected hit detection, rich tooltip
- Legend hover → highlights cluster on canvas in real time

**Data source:** `GET /api/v1/github/spatial?repo=`

---

### `VectorIndexView.jsx` — Operational Dashboard

| Section | Content |
|---|---|
| Stat cards (×4) | Vectors indexed, embedding dimension, disk size, cluster count |
| Coverage ring | Animated SVG ring, color-coded (green ≥90%, amber ≥60%, red otherwise) |
| Similarity distribution | Bar chart of pairwise cosine similarity buckets |
| Index config grid | Type, metric, model, build timestamp, storage path |
| Cluster breakdown table | All clusters sorted by size: size bar, urgency badge, cohesion % |
| Live semantic search | POSTs to AI search, displays LLM answer + source issue chips |

**Data source:** `GET /api/v1/github/vector-stats?repo=`

Also exports `BackendStatusView` used in the Backend Status tab.

---

## State Management Philosophy

**No global store.** Three tiers:

| Tier | Mechanism | Purpose |
|---|---|---|
| Session | `sessionStorage` | Active repo, GitHub token |
| Component | `useState` / `useRef` | All UI state |
| Stream buffer | `useRef` + `setInterval` | SSE cluster batching |

The SSE buffer pattern prevents flooding React's reconciler during large syncs:
```js
// Clusters arrive fast — push to ref (no re-render)
bufferRef.current.push(clusterPayload);

// Drain ref into React state every 400ms (single batched update)
setInterval(() => {
  const batch = bufferRef.current.splice(0, 50);
  setClusters(prev => mergeClusters(prev, batch));
}, 400);
```

---

## API Communication Layer

All API calls use bare `fetch()` — no Axios, no React Query. Base URL hardcoded to `http://localhost:8000`.

**Standard pattern:**
```js
fetch(`http://localhost:8000/api/v1/github/cluster/${id}`)
  .then(r => r.ok ? r.json() : Promise.reject(r.status))
  .then(setData)
  .catch(err => setError(String(err)));
```

**Trailing slash rule:** FastAPI 307-redirects `/api/v1/issues` → `/api/v1/issues/`.
Always include the trailing slash on list endpoints to avoid the redirect.

---

## SSE Stream Handling

The intelligence pipeline delivers cluster data as Server-Sent Events.

```js
// Custom async generator for parsing SSE
async function* readSSEStream(response) {
  // Reads Response body as a ReadableStream
  // Splits chunks on newlines
  // Yields parsed JSON from "data: {...}" lines
}

// Consumed in Dashboard.startStream()
for await (const { type, payload } of readSSEStream(resp)) {
  if (type === 'status')        setStatusMsg(payload.msg);
  if (type === 'cluster_found') bufferRef.current.push(payload);
  if (type === 'complete')      finalize();
  if (type === 'error')         setHasError(true);
}
```

Stream is aborted via `AbortController` on component unmount or manual re-sync.

---

## WebSocket Integration

```
ws://localhost:8000/api/v1/github/ws/sync/{repo}
```

Two message shapes:
```json
{ "processed": 450, "total_repo": 2500, "is_syncing": true }
{ "new_activity": true, "new_event_count": 3 }
```

Drives: header progress bar + "new issues detected on GitHub" notification banner.
Auto-reconnects after 4s. No exponential backoff.

---

## Design System

Core palette (all inline in `style={}`):

| Token | Value | Usage |
|---|---|---|
| bg-deep | `#0a0e1a` | Canvas backgrounds |
| bg-base | `#0d1117` | Page background |
| bg-surface | `#161b22` | Panel headers, hover |
| border | `#21262d` | Primary borders |
| border-subtle | `#30363d` | Secondary borders |
| text-primary | `#c9d1d9` | Body text |
| text-secondary | `#8b949e` | Labels, metadata |
| text-muted | `#6e7681` | Timestamps, hints |
| accent-blue | `#58a6ff` | CTAs, links, primary accent |
| success | `#3fb950` | Open issues, positive |
| warning | `#d29922` | Caution |
| error | `#f85149` | Critical, errors |
| purple | `#bc8cff` | Memory/process metrics |

Keyframe animations (defined in Dashboard's inline `<style>`):
- `spin` — all loading spinners
- `fadeUpIn` — tab content entrance (`translateY(6px) → 0`, 400ms ease)

---

## Local Development

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

Backend must run separately on `:8000`. No Vite proxy — frontend talks directly to backend. CORS is handled by `CORSMiddleware` on the backend.

**To change backend URL:** find/replace `localhost:8000` across `src/pages/`.

---

## Known Limitations

| # | Issue | Impact |
|---|---|---|
| 1 | GitHub token from login page not forwarded to API calls | Token-scoped GitHub API access not functional end-to-end |
| 2 | API base URL hardcoded to `localhost:8000` | Cannot deploy to CDN against remote backend without code change |
| 3 | No lazy route loading | Larger initial bundle (~800KB unminified) |
| 4 | Error boundary only at root level | Tab-level crash (e.g. canvas error) affects full Dashboard |
| 5 | WebSocket reconnect fixed at 4s, no jitter | Reconnect storm if many clients restart simultaneously |
| 6 | `sessionStorage` tab isolation is incidental | Copy-pasted tabs may confuse users expecting shared state |
