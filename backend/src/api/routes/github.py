import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from pydantic import BaseModel

from src.db.models import get_db, IssueModel, ClusterModel, scorched_earth_for_repo, SessionLocal
from src.services.github.github_service import github_service
