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
