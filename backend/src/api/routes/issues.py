from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from src.schemas.issue import IssueCreate, IssueResponse
from src.db.models import get_db, IssueModel
from src.services.ai.embedding_engine import engine as embedder
from src.services.ai.vector_store import VectorStore
# Initialize the singleton VectorStore with the model's dimension
# It's done at boot time in the router or main.
from src.core.logger import log

router = APIRouter()

# Global reference that will be set in main.py
v_store = None

@router.post("/", response_model=IssueResponse)
async def ingest_issue(issue: IssueCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    global v_store
    
    log.info(f"Ingesting new issue: {issue.title}")
    
    # 1. Save to DB immediately (speed layer)
    db_issue = IssueModel(title=issue.title, body=issue.body)
    db.add(db_issue)
    db.commit()
    db.refresh(db_issue)
    
    # 2. NLP Pipeline
    try:
        combined_text = f"{issue.title}. {issue.body}"
        vector = embedder.generate_embedding(combined_text)
        
        # 3. Synchronous similarity check to classify duplicate count immediately
        similar_results = []
        if v_store:
