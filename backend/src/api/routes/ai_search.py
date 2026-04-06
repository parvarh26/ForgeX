from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from src.db.models import get_db, IssueModel
from src.services.ai.embedding_engine import engine as embedder
from src.services.ai.llm_service import llm
from src.api.routes.github import _vector_stores
from src.core.logger import log

router = APIRouter()

class SearchRequest(BaseModel):
    repo: str
    query: str

class SearchResponse(BaseModel):
    answer: str
    sources: list[int] # github_issue_ids

@router.post("/search")
async def ai_semantic_search(request: SearchRequest, db: Session = Depends(get_db)):
    """
    AI Search Layer: Embeds query -> FAISS lookup -> Gemma 4 synthesis.
    Design kept modular to support a future Chatbot (linear-conversation).
    """
    if request.repo not in _vector_stores:
        # If user hasn't synced this session, try to load from DB metadata if index exists
        # For now, we expect at least one foreground sync to have happened.
        raise HTTPException(status_code=400, detail="Intelligence matrix for this repo not yet initialized. Please run a sync first.")

    v_store = _vector_stores[request.repo]
    
    try:
        # 1. Embed the query using SOTA MINI-LM
        query_vector = embedder.generate_embedding(request.query)
        
        # 2. Vector search for top similarity matches
        matches = v_store.search_similar(query_vector, top_k=5)
        
        if not matches:
            return SearchResponse(answer="No similar issues found in the spatial matrix.", sources=[])
        
        # 3. Fetch full context from DB for the matches
        source_db_ids = [m['db_id'] for m in matches]
        issue_rows = db.query(IssueModel).filter(IssueModel.id.in_(source_db_ids)).all()
        
        context_texts = []
        source_github_ids = []
        for row in issue_rows:
            # Include labels and state for the LLM to provide richer context
            label_info = f" [Labels: {row.labels}]" if row.labels else ""
            context_texts.append(f"Issue #{row.github_issue_id} (State: {row.state}){label_info}: {row.title}. {row.body}")
            source_github_ids.append(row.github_issue_id)

        # 4. Synthesize answer using Gemma 4 (via Groq)
        answer = await llm.answer_semantic_query(request.query, context_texts)
        
        return SearchResponse(
            answer=answer,
            sources=source_github_ids
        )

    except Exception as e:
        log.error(f"AI Search fault: {e}")
        raise HTTPException(status_code=500, detail=f"Search Engine Error: {str(e)}")
