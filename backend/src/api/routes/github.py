import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from pydantic import BaseModel

from src.db.models import get_db, IssueModel, ClusterModel, scorched_earth_for_repo, SessionLocal
from src.services.github.github_service import github_service
from src.services.ai.embedding_engine import engine as embedder
from src.services.ai.vector_store import VectorStore
from src.services.ai.clustering_engine import clusterer
from src.services.ai.llm_service import llm
from src.core.logger import log

router = APIRouter()


class SyncRequest(BaseModel):
    repo: str  # Format: "owner/repo" e.g. "facebook/react"


def _sse_event(payload: dict) -> str:
    """Format a dict as a valid SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"


async def _stream_intelligence(repo: str, db: Session):
    """
    Core SSE generator — implements the full flow from plan.md §7.

    1. Scorched-earth cleanup for the repo tenant
    2. Fetch 200 issues from GitHub via HTTPX (Industrial Scaling)
    3. Initialize ephemeral FAISS space
    4. Chunk issues mod 16 → run_in_threadpool → FAISS → DBSCAN → yield SSE chunk
    5. Persist results to SQLite
    6. Signal completion
    """

    try:
        # ── STATUS: Pipeline boot ──────────────────────────────────────────────
        yield _sse_event({
            "type": "status",
            "payload": {"msg": f"Pipeline initialized for {repo}. Booting intelligence layers..."}
        })

        # ── SCORCHED EARTH: wipe old tenant data ───────────────────────────────
        deleted_i, deleted_c = scorched_earth_for_repo(db, repo)
        log.info(f"Scorched-earth complete: removed {deleted_i} issues, {deleted_c} clusters for '{repo}'")
        yield _sse_event({
            "type": "status",
            "payload": {"msg": f"Tenant namespace cleared. Fetching live issues from github.com/{repo}..."}
        })

        # ── GITHUB FETCH ───────────────────────────────────────────────────────
        try:
            # Plan updated: Industrial Scale default is 200
            raw_issues = await github_service.fetch_issues(repo, limit=200)
        except ValueError as e:
            yield _sse_event({"type": "error", "payload": {"msg": str(e)}})
            return

        if not raw_issues:
            yield _sse_event({"type": "error", "payload": {"msg": f"No open issues found for '{repo}'."}})
            return

        total = len(raw_issues)
        yield _sse_event({
            "type": "status",
            "payload": {"msg": f"Fetched {total} open issues. Initializing FAISS spatial matrix..."}
        })

        # ── EPHEMERAL FAISS SPACE ──────────────────────────────────────────────
        # Fresh index per plan.md §6.1 — garbage collected after stream completes
        v_store = VectorStore(dimension=embedder.dimension)

        # Persist raw issues to DB first (speed layer)
        db_issue_map = {}  # github_issue_id -> db row id
        for raw in raw_issues:
            db_issue = IssueModel(
                repo_name=repo,
                github_issue_id=raw["github_issue_id"],
                title=raw["title"],
                body=raw["body"],
                priority_score=0.5,
            )
            db.add(db_issue)
        db.commit()
        # Refresh to get assigned IDs
        all_db_issues = db.query(IssueModel).filter(IssueModel.repo_name == repo).all()
        for db_issue in all_db_issues:
            db_issue_map[db_issue.github_issue_id] = db_issue

        # ── THREAD-POOL CHUNKING (mod 16) ─────────────────────────────────────
        # Plan §4.1: chunk array modulo 16 to avoid 5+ second event-loop hard-fault
        CHUNK_SIZE = 16
        seen_cluster_labels = {}  # track clusters emitted so far

        for chunk_start in range(0, total, CHUNK_SIZE):
            batch_raw = raw_issues[chunk_start: chunk_start + CHUNK_SIZE]
            batch_texts = [f"{i['title']}. {i['body']}" for i in batch_raw]

            # Shift heavy CPU math (PyTorch SIMD) into thread-pool — plan §4.1
            vectors = await run_in_threadpool(embedder.generate_embeddings, batch_texts)

            # Add batch to ephemeral FAISS
            for i, vec in enumerate(vectors):
                raw_issue = batch_raw[i]
                db_row = db_issue_map.get(raw_issue["github_issue_id"])
                if db_row:
                    v_store.add_vector(db_row.id, vec)

            # ── DBSCAN after each chunk ──────────────────────────────────────
            all_vecs, all_ids = v_store.get_all_vectors()
            if len(all_vecs) < 2:
                continue

            cluster_map = clusterer.compute_clusters(all_vecs, all_ids)

            # ── Yield newly discovered / updated clusters ────────────────────
            for label, group_ids in cluster_map.items():
                if label == -1:
                    continue  # DBSCAN noise — skip

                # Collect real text for meaningful LLM insight
                context_texts = []
                github_numbers = []
                for db_id in group_ids:
                    # Find the DB row by primary key
                    matching = [r for r in all_db_issues if r.id == db_id]
                    if matching:
                        row = matching[0]
                        context_texts.append(f"{row.title}. {row.body}")
                        github_numbers.append(row.github_issue_id)

                insight = llm.generate_cluster_insight(context_texts)
                urgency = "Critical" if len(group_ids) >= 4 else "Medium"

                cluster_key = f"{label}:{len(group_ids)}"
                if seen_cluster_labels.get(label) != cluster_key:
                    seen_cluster_labels[label] = cluster_key
                    yield _sse_event({
                        "type": "cluster_found",
                        "payload": {
                            "cluster_label": label,
                            "insight": insight,
                            "issue_count": len(group_ids),
                            "urgency": urgency,
                            "github_issue_numbers": github_numbers,
                            "progress": f"{min(chunk_start + CHUNK_SIZE, total)}/{total} issues processed",
                        }
                    })

            yield _sse_event({
                "type": "progress",
                "payload": {
                    "processed": min(chunk_start + CHUNK_SIZE, total),
                    "total": total,
                    "msg": f"Chunk {chunk_start // CHUNK_SIZE + 1} complete. {len(cluster_map) - (1 if -1 in cluster_map else 0)} active clusters."
                }
            })

            # Yield control briefly so FastAPI can flush the buffer
            await asyncio.sleep(0)

        # ── FINAL SIGNAL ──────────────────────────────────────────────────────
        final_cluster_count = len([k for k in seen_cluster_labels if k != -1])
        yield _sse_event({
            "type": "complete",
            "payload": {
                "msg": f"Intelligence sweep complete. {final_cluster_count} distinct clusters identified in {total} issues.",
                "total_issues": total,
                "total_clusters": final_cluster_count,
                "repo": repo,
            }
        })

    except Exception as e:
        log.error(f"SSE stream faulted: {e}", exc_info=True)
        yield _sse_event({"type": "error", "payload": {"msg": f"Pipeline fault: {str(e)}"}})


async def background_crawl(repo: str, db_factory):
    """
    Background worker that fetches ALL remaining open issues and caches them.
    """
    log.info(f"Background crawl started for {repo}")
    # We use a fresh session because the request session will be closed
    db = db_factory()
    try:
        # Fetch a larger batch (e.g., 500 more) to populate the cache
        additional_issues = await github_service.fetch_issues(repo, limit=600)
        for raw in additional_issues:
            # Check if exists to avoid duplicates
            exists = db.query(IssueModel).filter(
                IssueModel.repo_name == repo,
                IssueModel.github_issue_id == raw["github_issue_id"]
            ).first()
            if not exists:
                db_issue = IssueModel(
                    repo_name=repo,
                    github_issue_id=raw["github_issue_id"],
                    title=raw["title"],
                    body=raw["body"],
                    priority_score=0.5,
                )
                db.add(db_issue)
        db.commit()
        log.info(f"Background crawl complete for {repo}. Cache warmed.")
    except Exception as e:
        log.error(f"Background crawl failed: {e}")
    finally:
        db.close()

@router.post("/sync")
async def sync_repository(request: SyncRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    POST /api/v1/github/sync
    
    Trigger a dual-phase sync:
    1. Real-time SSE stream for first 100 issues (Immediate UX).
    2. Background crawl for the full repository (Long-term Cache).
    """
    log.info(f"SSE sync initiated for repo: {request.repo}")

    from src.db.models import SessionLocal
    background_tasks.add_task(background_crawl, request.repo, SessionLocal)

    return StreamingResponse(
        _stream_intelligence(request.repo, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )
