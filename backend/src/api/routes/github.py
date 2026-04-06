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
