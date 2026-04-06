from fastapi import APIRouter
from src.core.logger import log
import src.api.routes.issues as issue_router # To access v_store
from src.services.ai.clustering_engine import clusterer
from src.services.ai.llm_service import llm
from src.schemas.issue import ClusterInsightResponse

router = APIRouter()

@router.get("/", response_model=list[ClusterInsightResponse])
async def get_clusters():
    log.info("Computing live DBSCAN clusters")
    
    v_store = issue_router.v_store
    if not v_store:
        return []
        
    vectors, ids = v_store.get_all_vectors()
