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
    
    cluster_map = clusterer.compute_clusters(vectors, ids)
    
    results = []
    
    # We must fetch the actual text for the LLM from the DB. 
    # For speed in simulation, we will mock the LLM context fetching here.
    cluster_id_counter = 1
    for label, group_ids in cluster_map.items():
        if label == -1: # Noise
            continue
            
        # Generate insight based on cluster items
        # Normally we'd ORM query the `body` field of the `group_ids` from DB
        insight = llm.generate_cluster_insight(["mock login text"] if cluster_id_counter==1 else ["mock ui text"])
        
        urgency = "Critical" if len(group_ids) >= 3 else "Medium"
        
        results.append(ClusterInsightResponse(
            cluster_id=cluster_id_counter,
            issue_count=len(group_ids),
            insight=insight,
            urgency=urgency,
            issues=[{"id": idx} for idx in group_ids]
        ))
        cluster_id_counter += 1
        
    return results
