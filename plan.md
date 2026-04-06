# Master System Design Document: OpenIssue Live AI Processing Platform

This document serves as the absolute baseline architectural blueprint for transforming OpenIssue into a real-time, LLM-powered GitHub mapping tool. It replaces simulated polling loops with production-level `Server-Sent Events (SSE)` and explicit machine learning pipelining boundaries.

## 1. Defining the Core Execution Challenge
In standard CRUD applications, HTTP flows are measured in milliseconds. In OpenIssue, the payload bottleneck is decoupled from database retrieval and deeply intertwined with heavy mathematical operations. When the system ingests 100 raw problem descriptions (GitHub issues), it must transform text strings into dense 384-dimensional mathematical arrays using HuggingFace’s `SentenceTransformers`. This is a non-trivial processing step that locks standard single-threaded Python interpreters. 

To overcome this, OpenIssue cannot use traditional REST `Request -> Process -> Response` models. We must move to an asynchronous streaming model, mimicking the architecture of Streamlit or ChatGPT, where intelligence builds organically onto the frontend canvas before the mathematical computation on the backend finishes completely.

## 2. Infrastructure: Transitioning to Server-Sent Events (SSE)
### 2.1 Why Not WebSockets?
WebSockets establish a bidirectional TCP pipe. While excellent for real-time multiplayer systems, they are stateful and difficult to scale linearly over load balancers (like NGINX or AWS ALB) without persistent connection tuning. Since OpenIssue only streams intelligence *down* to the client after a trigger query, Server-Sent Events (SSE) over HTTP/2 provide the exact 'live feed' feeling while remaining fully stateless and cache-friendly.

### 2.2 Streaming Implementation Details
Our FastAPI middleware must implement `StreamingResponse`. When the frontend issues a `POST /api/v1/github/sync`, the backend acknowledges the request, but defers yielding complete results.
As our clustering algorithm chunk-processes incoming strings and identifies a stable cluster boundary (for instance, spotting 5 issues all mentioning "hydration mismatch"), the backend yields a structured text stream slice:
`data: {"type": "cluster_found", "payload": {"insight": "React 18 Hydration Error", "issues": [1402, 1109]}}`
React reads this natively via the `EventSource` web API and renders the new cluster node locally without refreshing.

## 3. The Unholy Premium Frontend Bridging Strategy
To mimic enterprise-grade development networks (like Vercel and Linear), the UI must mask background processing lag precisely.

### 3.1 Cursors and Data Virtualization
A repository like `kubernetes/kubernetes` has thousands of active issues. If our backend streams 500 mapped clusters to the React frontend, rendering 500 heavy `<ClusterCard />` DOM nodes will freeze the browser's Main Thread (JavaScript execution block). Consequently, the UI will stutter and animations will tear. 
We circumvent this using `<VirtualList />` implementations. Only the physical pixels currently mapped to the user's monitor display limit (the viewport) will mount React components. As the user scrolls vertically, DOM nodes are recycled. This bounds browser RAM to a flat asymptote.

### 3.2 Interaction Physics
The bridge between User Input and Middleware response must feel physical. 
When hovering over a synchronization button, the initial handshake to the GitHub API begins instantly (`onClick` is too late; start pre-fetching on `onMouseEnter`). By the time the click event resolves, DNS lookup and TLS handshakes are complete, creating a perceived zero-latency initialization.

## 4. Middleware & Multi-Threading Pipelines
FastAPI runs on the ASGI standard (starlette). Its event loop spins rapidly handling light I/O operations. PyTorch, which powers our LLM embeddings, relies on extensive CPU SIMD instructions that physically block threads from processing secondary networks.

### 4.1 Chunking Vectorization
To process incoming data without triggering `TimeOut` errors from edge networks, the Python environment executes a "Thread-Pool Chunking Protocol".
Instead of passing 100 texts to `model.encode(texts)`, which guarantees a 5+ second hard-fault, we chunk the array modulo 16.
```python
import asyncio
from fastapi.concurrency import run_in_threadpool

async def stream_vectors(issues):
    for idx_boundary in range(0, len(issues), 16):
        batch = issues[idx_boundary_start : idx_boundary_start + 16]
        # Shift heavy CPU math out of the async loop
        vectors = await run_in_threadpool(embedder.generate_embeddings, batch)
        yield vectors
```
By isolating the generation of embeddings into the thread-pool, the FastAPI event loop is free to yield its streamed data chunks back through the open SSE channel back to the user's browser concurrently.

## 5. Persistence vs. Locality: Database Architecture
Our database structure must reject the notion of global states. If `facebook/react` issues mix with `vercel/next.js`, our spatial matrix implodes.

### 5.1 Multi-Tenant Schema Boundaries
In standard SQLite operations across Demo contexts, the schema must include a `repo_name` boundary. Every Issue and Cluster saved to the database belongs to a strictly defined tenant space. To prevent the Demo DB from inflating infinitely, the server will execute a 'Scorched Earth' initialization protocol before mapping a new repository: identifying any localized tables attached to an old URL and wiping them atomically. 

## 6. The Spatial Computation Layer 

### 6.1 FAISS (Locality-Sensitive Filtering)
FAISS (Facebook AI Similarity Search) calculates dense vector inner products at billions of operations per second using C++ binaries. FAISS flat indexes (`IndexFlatIP`) do not naturally label dimensional vectors string-wise. Thus, we maintain a secondary `id_map`. However, dropping isolated `repo_name` entries out of FAISS scales poorly (O(n) rebuilds). 
Instead of maintaining an infinitely dense global index, we operate transiently: when `POST /sync` fires, a fresh, completely empty FAISS space is initialized in memory solely for the purpose of clustering the single requested repository instance. Upon completion, the matrix is garbage collected.

### 6.2 DBSCAN Clustering Heuristics
The spatial distance identifying whether a bug report belongs to Cluster A or Cluster B is strictly governed by `Cosine Similarity` derived mapped algorithms. Density-Based Spatial Clustering of Applications with Noise (DBSCAN) discovers boundary regions naturally based on Epsilon distributions. Since we normalize our NLP vectors on the unit sphere, bounding `Epsilon` specifically between `0.15` and `0.30` identifies micro-trends (perfect for isolated library bugs), whereas an `Epsilon` of `0.6` generalizes the grouping into generalized topics ("Frontend Bugs" vs "Backend Bugs"). For OpenIssue, maintaining a rigid variable of `Epsilon = 0.28` will isolate extremely high value patterns automatically.

## 7. The Final Flow Matrix
When executed cleanly, the system adheres to the following choreography:
1. The user logs in via GitHub OAuth on the Unholy Premium UI.
2. The user types `laravel/framework` into the input node. 
3. The Input visually locks. An Axios POST network hook triggers the FastAPI router.
4. FastAPI validates the repo, initiates an HTTPX Async Connection, and pulls 50 open issues.
5. FastAPI instantly routes to `Dashboard`. The UI connects via an SSE channel waiting on `/stream`.
6. Concurrently, PyTorch intercepts the 50 issues via Thread Pool slices (Array mod 16).
7. As slicing finishes, FAISS identifies tight topological nodes using Cosine Distance. 
8. DBSCAN evaluates spatial clustering thresholds, identifying a cluster of 8 issues mathematically parallel concerning a specific authentication defect.
9. FastAPI flushes this completed chunk onto the SSE channel.
10. The UI intercepts the payload, interpolates the new node into the React Virtual Map, and paints it with the cubic-bezier transition engine. 

This completes the absolute production baseline required for SDE-3 operations without unnecessary synthetic expansion codes.