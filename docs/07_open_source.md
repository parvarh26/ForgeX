# OpenIssue — Open Source & Motive Documentation

> **Part 7 of 7** | Project purpose, origin story, architecture rationale, and contribution guide

---

## Table of Contents

1. [The Problem](#the-problem)
2. [The Motive](#the-motive)
3. [Why This Exists](#why-this-exists)
4. [How It Solves the Problem](#how-it-solves-the-problem)
5. [Architecture Rationale](#architecture-rationale)
6. [What This Is NOT](#what-this-is-not)
7. [Open Source Philosophy](#open-source-philosophy)
8. [Getting Started](#getting-started)
9. [Project Structure at a Glance](#project-structure-at-a-glance)
10. [Contributing Guide](#contributing-guide)
11. [Roadmap](#roadmap)
12. [License & Credits](#license--credits)

---

## The Problem

Open-source maintainers are drowning.

A popular GitHub repository like `facebook/react` has **1,168+ open issues** at any given time. Every day, new issues arrive. Some are duplicates of existing reports. Some describe symptoms of the same root cause. Some are feature requests mislabeled as bugs. Some are urgent security holes buried under a pile of cosmetic complaints.

The maintainer's daily reality:

```
9:00 AM    — 14 new issues overnight
9:05 AM    — 3 are duplicates of existing reports (but phrased differently)
9:15 AM    — 1 is a known bug that was fixed 2 weeks ago (reporter didn't check)
9:30 AM    — 2 describe the same hydration error from different angles
9:45 AM    — 1 is a genuine critical regression — you almost missed it
10:00 AM   — You've spent an hour and haven't written a single line of code
```

The existing tools don't help:
- **GitHub's built-in search** is keyword-based. You have to know what to search for. "Hydration error" and "SSR content mismatch" are the same problem — GitHub doesn't know that.
- **Labels** require manual work to apply and are inconsistently used.
- **Bots** like Stale Bot just close old issues — they don't understand them.

**Maintainers waste 30–60% of their triage time on work a machine can do.** Not creative work. Not decision-making. Just pattern recognition: "is this a duplicate?" "what area does this affect?" "how urgent is this?"

---

## The Motive

OpenIssue was built for one reason: **give maintainers their morning back.**

Not a dashboard that shows pretty charts. Not an AI chatbot that hallucinates. A tool that does the tedious part of triage — **clustering related issues, detecting duplicates, scoring priority** — so the human can focus on the 10% that requires human judgment.

### Design Principles

1. **Instant value.** Connect a repo, see clusters in 30 seconds (from cache) or 5 minutes (full sync). No configuration, no training data, no LLM prompt engineering.

2. **Real AI, not theater.** Every vector comes from a real `all-MiniLM-L6-v2` embedding. Every cluster comes from real DBSCAN. Every similarity score is a real cosine computation. When we say "91.2% similar," we computed `dot(v1, v2)` on L2-normalized embeddings — not a random number.

3. **Fail open.** If the LLM is down, you still see clusters (with keyword-based insights). If FAISS can't load, you still see raw issues. If the model hasn't downloaded yet, the server still starts. Every AI component degrades gracefully — the tool never becomes worse than GitHub itself.

4. **Respect the maintainer's time.** No onboarding wizard. No tutorial. No "upgrade to Pro." You clone it, run `./start-all.sh`, and you're working. The Intelligence tab auto-syncs on load. The search bar is one keypress (`/`) away.

---

## Why This Exists

OpenIssue was created as a hackathon project with a constraint: **build an intelligent issue triage assistant in 24 hours.**

The original spec:
- Issue classification
- Duplicate detection
- Priority scoring
- Bonus: GitHub webhook bot, auto-comment suggestions

What was built goes beyond the spec:
- **Semantic clustering** of entire repositories (not just classification of individual issues)
- **Spatial visualization** of the vector space via PCA
- **FAISS index telemetry** with similarity distribution analysis
- **Real-time SSE streaming** of the intelligence pipeline
- **Background sync with WebSocket progress** broadcasting
- **AI-powered semantic search** with LLM-synthesized answers citing source issues
- **Maintainer triage tools** (priority, bookmarks, notes, linked PRs)
- **Code browser** with syntax highlighting for repository exploration
- **Graceful degradation** for small repos (raw issue fallback when clustering fails)

The project evolved from a 24-hour MVP into a production-hardened intelligence platform through multiple iterations of bug fixing, performance optimization, and architectural improvements.

---

## How It Solves the Problem

### 1. Duplicate Detection → Semantic Clustering

Instead of matching exact keywords, OpenIssue embeds every issue into a 384-dimensional vector space using MiniLM. Issues about the same underlying problem — even if described with completely different words — end up near each other in vector space.

DBSCAN then finds dense regions: if 7 issues are all within `0.28` cosine distance of each other, they form a cluster. The maintainer sees one card labeled "React rendering alignment issue" with 7 issues — not 7 separate inbox items.

### 2. Priority Scoring → Cluster Size + Real Similarity

The urgency heuristic is simple: bigger clusters = bigger problem.
- 10+ issues → **Critical** (many people hitting the same bug)
- 5–9 issues → **High**
- 2–4 issues → **Medium**

The similarity score tells you **how coherent** the cluster is: 95% means all issues describe exactly the same thing (likely duplicates). 60% means related but distinct symptoms.

### 3. Label Suggestion → LLM Insight

Each cluster gets a one-sentence insight generated by Groq's Gemma 4:
```
"React rendering alignment issue identified — pattern: event, react, disabling, stops."
```

This replaces 15 minutes of reading 7 issues to understand the theme. The maintainer can now label all 7 issues with one mental decision.

### 4. Search → Semantic, Not Keyword

Maintainer types: "Why do hydration errors happen with server-side rendering?"

The query is embedded, FAISS returns the 5 most semantically similar issues, and Groq synthesizes an answer **citing the actual issue numbers**:

> "As seen in Issue #18790, hydration errors occur when the server-rendered HTML does not match the client-rendered output..."

The maintainer gets an answer grounded in their codebase's actual bug reports — not a generic StackOverflow answer.

---

## Architecture Rationale

### Why SQLite, Not PostgreSQL?

- **Zero configuration.** No Docker container, no connection string, no password.
- **Single file.** `openissue.db` can be copied, backed up, or deleted with `rm`.
- **WAL mode** gives concurrent read+write performance sufficient for a single-maintainer tool.
- **When to switch:** If you need multi-instance deployment or >100 concurrent users, migrate to PostgreSQL.

### Why FAISS, Not Pinecone/Weaviate/Chroma?

- **No cloud dependency.** Runs entirely offline.
- **No additional process.** Embedded in the Python process, not a separate server.
- **IndexFlatIP is exact search.** No approximation, no recall loss. 100% accuracy on similarity results.
- **When to switch:** If the repo has >100k issues, switch to `IndexIVFFlat` (trains on the data, uses approximate search). If you need persistence guarantees beyond file-based storage, use Chroma.

### Why MiniLM, Not OpenAI Embeddings?

- **Runs offline.** No API key needed for the core embedding pipeline.
- **Free.** No per-token cost. Embed 100k issues for $0.
- **Fast.** 384 dimensions (vs OpenAI's 1536) = 4x less storage, 4x faster search.
- **When to switch:** If embedding quality is insufficient (rare for technical text), switch to `all-mpnet-base-v2` (768d, same library, 2x slower).

### Why SSE, Not Polling?

- **No missed updates.** Polling at 1-second intervals would miss sub-second cluster arrivals.
- **Lower overhead.** One TCP connection vs 60 requests/minute.
- **Native browser support.** The frontend uses the Fetch API's `ReadableStream` — no library needed.
- **Unidirectional.** The client never sends data during streaming — SSE's one-way design is a perfect fit.

### Why WebSocket for Sync Progress (Not SSE)?

The sync progress feed needs to run **indefinitely** (polling for new GitHub activity every 30 seconds even after sync completes). SSE is designed for finite streams. WebSocket's persistent bidirectional channel is the correct abstraction for an indefinite monitoring feed.

---

## What This Is NOT

- ❌ **Not a GitHub replacement.** You still manage issues on GitHub. OpenIssue is a read-only intelligence layer.
- ❌ **Not a project management tool.** No Kanban boards, no sprints, no milestones.
- ❌ **Not multi-tenant.** One instance = one user. No team collaboration features.
- ❌ **Not a hosted service.** You run it yourself. There is no cloud deployment.
- ❌ **Not a GitHub Action.** It doesn't comment on issues or close duplicates automatically (yet).

---

## Open Source Philosophy

### Why Open Source?

1. **Maintainers help maintainers.** The people who need this tool are the people who build open-source software. It would be hypocritical to charge them for it.

2. **Transparency of AI.** When an AI tool says "these issues are 91.2% similar," you should be able to read the code that computed that number. No black boxes.

3. **Extensibility.** Every maintainer's workflow is different. Open source lets you add your own triage statuses, change the DBSCAN parameters, swap the LLM provider, or disable features you don't need.

### How to Use This Code

You may:
- Clone and run it for your own repos
- Modify it for your team's workflow
- Fork it and build your own product
- Use the architecture patterns in your own projects
- Reference it in academic work

---

## Getting Started

### Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-org/openissue.git
cd openissue

# 2. Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate    # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Create environment file
cat > .env << EOF
GROQ_API_KEY=gsk_your_key_here
GITHUB_TOKEN=github_pat_your_token_here
LLM_MODEL=gemma4-26b-it
DBSCAN_EPS=0.28
DBSCAN_MIN_SAMPLES=2
EOF

# 4. Frontend setup
cd ../frontend
npm install

# 5. Run everything
cd ..
chmod +x start-all.sh
./start-all.sh
```

### What Happens on First Start

1. **Backend boots** (port 8000)
   - SQLite database created automatically (`openissue.db`)
   - Schema tables created via `Base.metadata.create_all()`
   - Embedding model downloads on first API call (~80MB, one-time)
2. **Frontend boots** (port 5173)
   - Vite dev server with HMR
3. Open `http://localhost:5173` in your browser
4. Enter any GitHub PAT (or skip — backend uses its own)
5. Enter a repo name (e.g., `facebook/react`)
6. Wait for the sync to complete — clusters appear in real time

### Getting API Keys

**GitHub Personal Access Token:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scope: `public_repo` (read-only access to public repos)
4. Copy the token to `.env` as `GITHUB_TOKEN`

**Groq API Key (for LLM insights):**
1. Go to https://console.groq.com
2. Create an account (free tier: 14,400 requests/day)
3. Generate an API key
4. Copy to `.env` as `GROQ_API_KEY`

**Without Groq key:** Everything still works — cluster insights fall back to keyword extraction (no LLM). Search answers fall back to mock responses.

**Without GitHub token:** Everything still works but you're limited to 60 GitHub API requests/hour (vs 5,000 with a token). Large repo syncs will hit rate limits.

---

## Project Structure at a Glance

```
openissue/
├── docs/                         # You are here — 7-part documentation
│   ├── 01_frontend.md
│   ├── 02_backend.md
│   ├── 03_api.md
│   ├── 04_routing.md
│   ├── 05_middleware.md
│   ├── 06_security.md
│   └── 07_open_source.md
├── backend/
│   ├── main.py                   # App factory
│   ├── .env                      # Secrets (git-ignored)
│   ├── openissue.db              # SQLite database (git-ignored)
│   ├── storage/vector_indices/   # FAISS files (git-ignored)
│   ├── requirements.txt          # Python dependencies
│   └── src/                      # All source code
│       ├── core/                 # Config, logger, exceptions
│       ├── db/                   # SQLAlchemy models
│       ├── schemas/              # Pydantic schemas
│       ├── services/ai/          # Embedding, FAISS, DBSCAN, LLM
│       ├── services/github/      # GitHub API client
│       └── api/routes/           # FastAPI route handlers
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx              # React root
│       ├── App.jsx               # Routes
│       └── pages/                # All page components
├── start-all.sh                  # One-command launcher
├── docker-compose.yml            # Docker config (basic)
└── goal.md                       # Original hackathon requirements
```

---

## Contributing Guide

### Code Style

**Python (backend):**
- No specific linter enforced. Follow PEP 8.
- Type hints encouraged but not required.
- Docstrings on all public functions.
- Domain exceptions for expected failures; let unexpected errors propagate to the global handler.

**JavaScript (frontend):**
- Functional components only. No class components (except `ErrorBoundary`).
- Inline styles using `style={}` objects. No CSS files per component.
- `fetch()` for all API calls.
- Hooks only: `useState`, `useEffect`, `useRef`, `useCallback`.

### Adding a New API Endpoint

1. Choose the correct router file in `backend/src/api/routes/`
2. Define a Pydantic model for request/response if needed
3. Add the route handler
4. If it needs DB access, add `db: Session = Depends(get_db)` parameter
5. Return consistent error shapes using `HTTPException` or `IntelligenceError`
6. Document the endpoint in `docs/03_api.md`

### Adding a New Page

1. Create `frontend/src/pages/NewPage.jsx`
2. Add the route in `frontend/src/App.jsx`
3. Add navigation from an existing page using `useNavigate()`
4. Follow the dark-mode palette defined in `docs/01_frontend.md`

### Adding a New AI Service

1. Create `backend/src/services/ai/new_service.py`
2. Use the lazy singleton pattern from `embedding_engine.py`
3. Add fail-open error handling (return degraded result, don't crash)
4. Import in the route handler, not at module level (prevents boot crashes)

### Running Tests

No test suite exists yet. Testing is the top priority for contribution.

Recommended test structure:
```
backend/tests/
├── test_embedding.py      # EmbeddingEngine unit tests
├── test_vector_store.py   # Atomic writes, load integrity checks
├── test_clustering.py     # DBSCAN edge cases (NaN, small corpus)
├── test_routes.py         # FastAPI TestClient integration tests
└── test_sync.py           # Background crawl, concurrent sync guard
```

---

## Roadmap

### Phase 1: Stability (Current)
- [x] Atomic FAISS persistence
- [x] Thread-safe VectorStore
- [x] Startup crash recovery
- [x] Small repo fallback (raw issues when 0 clusters)
- [x] Real cosine similarity scores (not hardcoded)
- [x] Parallel LLM calls with semaphore
- [x] DB session released before SSE streaming
- [ ] Integration test suite
- [ ] Structured access logging

### Phase 2: Intelligence
- [ ] HDBSCAN for better clustering on large repos
- [ ] Incremental re-clustering (don't rebuild from scratch every sync)
- [ ] Trend detection: "this cluster grew 40% this week"
- [ ] Auto-label suggestions based on cluster themes
- [ ] Cross-repo pattern matching (same bug in multiple repos)

### Phase 3: Integration
- [ ] GitHub Action that comments on new issues with duplicate links
- [ ] GitHub Action that auto-labels issues based on cluster assignment
- [ ] Slack/Discord webhook for critical cluster alerts
- [ ] OAuth login flow (replace PAT entry)
- [ ] Multi-user support with role-based access

### Phase 4: Scale
- [ ] PostgreSQL migration for multi-instance deployment
- [ ] FAISS IndexIVFFlat for repos >100k issues
- [ ] Redis for shared sync state across instances
- [ ] CDN deployment for frontend
- [ ] Kubernetes Helm chart

---

## License & Credits

### Technology Credits

| Technology | Creator | License |
|---|---|---|
| FastAPI | Sebastián Ramírez | MIT |
| React | Meta | MIT |
| FAISS | Meta AI Research | MIT |
| sentence-transformers | UKP Lab (TU Darmstadt) | Apache 2.0 |
| all-MiniLM-L6-v2 | Microsoft | MIT |
| DBSCAN (scikit-learn) | scikit-learn contributors | BSD 3-Clause |
| Groq API | Groq, Inc. | Proprietary (API terms) |
| Vite | Evan You | MIT |
| SQLite | D. Richard Hipp | Public Domain |

### Built With

Built by developers who maintain open-source projects and got tired of spending their mornings on triage instead of code.
