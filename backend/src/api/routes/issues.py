from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from src.schemas.issue import IssueCreate, IssueResponse
from src.db.models import get_db, IssueModel
from src.services.ai.embedding_engine import engine as embedder
from src.services.ai.vector_store import VectorStore
# Initialize the singleton VectorStore with the model's dimension
