import json
import asyncio
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from pydantic import BaseModel

from src.db.models import get_db, IssueModel, ClusterModel, SessionLocal
from src.services.github.github_service import github_service
from src.services.ai.embedding_engine import engine as embedder
from src.services.ai.vector_store import VectorStore
from src.services.ai.clustering_engine import clusterer
from src.services.ai.llm_service import llm
from src.core.logger import log

router = APIRouter()

# Global dict to track background pagination crawl progress per repo
_sync_status = {}
# Global cache for VectorStores to enable instant AI search across repos
_vector_stores = {}
# Concurrency locks to prevent duplicate background syncs for the same repo
_sync_locks = {}

class SyncRequest(BaseModel):
    repo: str  # Format: "owner/repo" e.g. "facebook/react"


def _sse_event(payload: dict) -> str:
    """Format a dict as a valid SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"


async def _stream_intelligence(repo: str, db: Session, request: Request):
    """
    Foreground SSE generator: Does NOT await GitHub. Simply reads the currently cached
    SQLite data, computes the spatial FAISS matrix, and yields the initial UI state fast.
    """
    try:
        yield _sse_event({
            "type": "status",
            "payload": {"msg": f"Loading cached intelligence for {repo}..."}
        })

        # OOM Prevention: Use a streaming query to avoid loading thousands of issues into RAM
        # query() is already lazy, but .all() triggers the load.
        issue_query = db.query(IssueModel).filter(IssueModel.repo_name == repo)
        total_cached = issue_query.count()

        if total_cached == 0:
            yield _sse_event({
                "type": "status",
                "payload": {"msg": f"No cached issues yet. Background sync is running..."}
            })
            yield _sse_event({
                "type": "complete",
                "payload": {
                    "msg": f"Awaiting background crawl...",
                    "total_issues": 0,
                    "total_clusters": 0,
                    "repo": repo,
                }
            })
            return

        yield _sse_event({
            "type": "status",
            "payload": {"msg": f"Initializing spatial matrix with {total_cached} issues..."}
        })

        if repo not in _vector_stores:
            _vector_stores[repo] = VectorStore(dimension=embedder.dimension, repo_name=repo)
        
        v_store = _vector_stores[repo]
        CHUNK_SIZE = 16
        seen_cluster_labels = {} 

        for chunk_start in range(0, total_cached, CHUNK_SIZE):
            # Loophole fix: Fetch ONLY the required batch from DB to keep RAM usage flat
            batch_db_issues = issue_query.offset(chunk_start).limit(CHUNK_SIZE).all()
            
            if not batch_db_issues:
                continue
                
            log.info(f"Processing chunk {chunk_start}/{total_cached} for {repo}...")
            
            # Deduplicate items that are already in the Vector Matrix
            new_issues = [row for row in batch_db_issues if row.id not in v_store.id_map]
            
            if new_issues:
                batch_texts = [f"{row.title}. {row.body}" for row in new_issues]
                vectors = await run_in_threadpool(embedder.generate_embeddings, batch_texts)

                for i, vec in enumerate(vectors):
                    db_row = new_issues[i]
                    v_store.add_vector(db_row.id, vec)

            all_vecs, all_ids = v_store.get_all_vectors()
            if len(all_vecs) < 2:
                continue

            cluster_map = clusterer.compute_clusters(all_vecs, all_ids)

            for label, group_ids in cluster_map.items():
                # Loophole fix: Check for client disconnect before every heavy LLM / SSE call
                if await request.is_disconnected():
                    log.warning(f"Client disconnected for {repo}. Stopping intelligence stream.")
                    return

                if label == -1: continue

                context_texts = []
                github_numbers = []
                for db_id in group_ids:
                    # Specialized row lookup (Session.get is O(1) in SQLAlchemy cache)
                    row = db.get(IssueModel, db_id)
                    if row:
                        context_texts.append(f"{row.title}. {row.body}")
                        github_numbers.append(row.github_issue_id)

                insight_full = await llm.generate_cluster_insight(context_texts)
                
                # Treat the first sentence as the concise card title, and the rest as the detailed summary.
                parts = insight_full.split(". ", 1)
                insight_title = parts[0] + ("." if len(parts) > 1 and not parts[0].endswith(".") else "")
                
                # Mathematics: True Internal Similarity Factor
                group_idx_set = set(group_ids)
                cluster_vecs = [v for v, p_id in zip(all_vecs, all_ids) if p_id in group_idx_set]
                
                sim_score = 100.0
                if len(cluster_vecs) > 1:
                    sims = []
                    for i in range(len(cluster_vecs)):
                        for j in range(i+1, len(cluster_vecs)):
                            sims.append(float(np.dot(cluster_vecs[i], cluster_vecs[j])))
                    sim_score = round(np.mean(sims) * 100, 1)

                urgency = "Critical" if len(group_ids) >= 4 else "Medium"

                cluster_key = f"{label}:{len(group_ids)}"
                if seen_cluster_labels.get(label) != cluster_key:
                    seen_cluster_labels[label] = cluster_key
                    yield _sse_event({
                        "type": "cluster_found",
                        "payload": {
                            "cluster_label": label,
                            "insight": insight_title,
                            "llm_summary": insight_full,
                            "similarity_score": f"{sim_score}%",
                            "issue_count": len(group_ids),
                            "urgency": urgency,
                            "github_issue_numbers": github_numbers,
                            "progress": f"Mapped {min(chunk_start + CHUNK_SIZE, total_cached)}/{total_cached} cached issues",
                        }
                    })
                    
            await asyncio.sleep(0)

        final_cluster_count = len([k for k in seen_cluster_labels if k != -1])
        status = _sync_status.get(repo, {})
        true_total = status.get("total_repo", total_cached)

        yield _sse_event({
            "type": "complete",
            "payload": {
                "msg": f"Matrix loaded. {final_cluster_count} active clusters.",
                "total_issues": true_total,
                "total_clusters": final_cluster_count,
                "repo": repo,
            }
        })

    except Exception as e:
        log.error(f"SSE stream faulted: {e}", exc_info=True)
        yield _sse_event({"type": "error", "payload": {"msg": f"Pipeline fault: {str(e)}"}})


async def background_crawl(repo: str, db_factory):
    """
    True async background worker fetching issues. Updates `_sync_status`.
    """
    log.info(f"Background sync started for {repo}")
    db = db_factory()

    try:
        # Initialize sync status with total metadata count
        try:
            repo_meta = await github_service.fetch_repo_metadata(repo)
            total_active_github_issues = repo_meta.get("open_issues_count", 0)
        except Exception:
            total_active_github_issues = 0

        # Find latest updated_at
        existing = db.query(IssueModel).filter(IssueModel.repo_name == repo).all()
        db_issue_map = {row.github_issue_id: row for row in existing}
        
        latest_updated = None
        for row in existing:
            if row.github_updated_at and (not latest_updated or row.github_updated_at > latest_updated):
                latest_updated = row.github_updated_at

        _sync_status[repo] = {
            "processed": len(existing),
            "total_repo": total_active_github_issues,
            "is_syncing": True
        }

        log.info(f"Background fetching for {repo} since {latest_updated}...")
        
        async for new_raw_batch in github_service.fetch_issues_stream(
            repo, 
            limit=None, 
            since=latest_updated
        ):
            if not new_raw_batch:
                continue

            for raw in new_raw_batch:
                if raw["github_issue_id"] in db_issue_map:
                    db_issue = db_issue_map[raw["github_issue_id"]]
                    db_issue.title = raw["title"]
                    db_issue.body = raw["body"]
                    db_issue.github_updated_at = raw["updated_at"]
                    db_issue.labels = raw.get("labels")
                    db_issue.state = raw.get("state", "open")
                else:
                    db_issue = IssueModel(
                        repo_name=repo,
                        github_issue_id=raw["github_issue_id"],
                        title=raw["title"],
                        body=raw["body"],
                        priority_score=0.5,
                        github_updated_at=raw.get("updated_at"),
                        labels=raw.get("labels"),
                        state=raw.get("state", "open")
                    )
                    db.add(db_issue)
                    db_issue_map[raw["github_issue_id"]] = db_issue
            
            db.commit()
            
            # Dynamically update the global status after each batch saves to DB
            _sync_status[repo]["processed"] = len(db_issue_map)
            log.info(f"Dynamically committed batch of {len(new_raw_batch)} issues.")

        log.info(f"Background sync complete for {repo}.")

    except Exception as e:
        log.error(f"Background crawl failed: {e}")
    finally:
        db.close()
        if repo in _sync_status:
            _sync_status[repo]["is_syncing"] = False

@router.get("/verify")
async def verify_repository(repo: str):
    """
    Backend-proxy for repository verification. Uses server-side GITHUB_TOKEN
    to avoid rate-limiting and User-Agent issues on the frontend.
    """
    try:
        metadata = await github_service.fetch_repo_metadata(repo)
        return {"status": "ok", "metadata": metadata}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Verification engine failure: {e}")
        raise HTTPException(status_code=500, detail="Internal Verification Error")

@router.post("/sync")
async def sync_repository(request_data: SyncRequest, background_tasks: BackgroundTasks, request: Request, db: Session = Depends(get_db)):
    """
    Triggers the streaming of CURRENT intelligence + kicks off Background crawler.
    """
    log.info(f"Sync initiated for repo: {request_data.repo}")

    # Loophole: Concurrency Race. Multiple clicks could trigger multiple backgrounds.
    if request_data.repo not in _sync_locks:
        _sync_locks[request_data.repo] = asyncio.Lock()
    
    lock = _sync_locks[request_data.repo]

    # Kick off the async paginator if it's not already running
    async with lock:
        if not _sync_status.get(request_data.repo, {}).get("is_syncing"):
            from src.db.models import SessionLocal
            background_tasks.add_task(background_crawl, request_data.repo, SessionLocal)

    return StreamingResponse(
        _stream_intelligence(request_data.repo, db, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )

@router.get("/sync/progress")
async def get_sync_progress(repo: str):
    """
    Poll this endpoint to draw the beautiful Sync Bar (Legacy fallback).
    """
    status = _sync_status.get(repo, {
        "processed": 0,
        "total_repo": 0,
        "is_syncing": False
    })
    return status

@router.websocket("/ws/sync/{repo}")
async def websocket_sync_progress(websocket: WebSocket, repo: str):
    """
    Real-time WebSocket stream for repository synchronization progress.
    Pushes status updates every 250ms to the frontend.
    """
    await websocket.accept()
    log.info(f"WebSocket sync connection opened for {repo}")
    try:
        while True:
            status = _sync_status.get(repo, {
                "processed": 0,
                "total_repo": 0,
                "is_syncing": False
            })
            await websocket.send_json(status)
            if not status["is_syncing"]:
                # Keep the connection alive for a few more seconds just in case
                await asyncio.sleep(5)
                # But stop the tight loop
                break
            await asyncio.sleep(0.25)
    except WebSocketDisconnect:
        log.info(f"WebSocket sync disconnected for {repo}")
    except Exception as e:
        log.error(f"WebSocket error for {repo}: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

@router.delete("/repo")
async def flush_intelligence(repo: str, db: Session = Depends(get_db)):
    """
    Final Hardening: Permanent deletion of all metadata for a repository.
    Wipes DB entries, FAISS index files, and internal caches.
    """
    log.warning(f"Flush requested for intelligence repo: {repo}")

    # 1. Block deletion if a sync is active
    if _sync_status.get(repo, {}).get("is_syncing"):
        raise HTTPException(status_code=400, detail="Cannot delete a repository while a sync is in progress.")

    # 2. Concurrency Lock
    if repo not in _sync_locks:
        _sync_locks[repo] = asyncio.Lock()
    
    async with _sync_locks[repo]:
        try:
            # 3. Wipe Database (Cascade is manual here for SQLite simplicity)
            db.query(IssueModel).filter(IssueModel.repo_name == repo).delete()
            db.query(ClusterModel).filter(ClusterModel.repo_name == repo).delete()
            db.commit()

            # 4. Wipe FAISS Storage
            if repo in _vector_stores:
                _vector_stores[repo].clear_storage()
                del _vector_stores[repo]
            else:
                # Fallback: manually attempt to delete files if not in cache
                temp_v = VectorStore(dimension=embedder.dimension, repo_name=repo)
                temp_v.clear_storage()

            # 5. Evict from status cache
            if repo in _sync_status:
                del _sync_status[repo]
            
            log.info(f"Successfully flushed all intelligence for {repo}")
            return {"status": "flushed", "repo": repo}
            
        except Exception as e:
            db.rollback()
            log.error(f"Failed to flush repo {repo}: {e}")
            raise HTTPException(status_code=500, detail=f"Flush failed: {str(e)}")
