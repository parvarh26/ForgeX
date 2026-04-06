from fastapi import APIRouter
from src.core.logger import log
import src.api.routes.issues as issue_router # To access v_store
from src.services.ai.clustering_engine import clusterer
from src.services.ai.llm_service import llm
from src.schemas.issue import ClusterInsightResponse

router = APIRouter()

