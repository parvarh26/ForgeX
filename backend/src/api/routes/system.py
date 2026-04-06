import psutil
import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from src.db.models import get_db, IssueModel, ClusterModel
from src.core.logger import log

router = APIRouter()

@router.get("/status")
async def system_status(db: Session = Depends(get_db)):
    """
    Real system telemetry: CPU, memory, DB stats, process info.
    """
    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    
    # DB stats
    total_issues = db.query(IssueModel).count()
    total_clusters = db.query(ClusterModel).count()
    repos = db.query(IssueModel.repo_name).distinct().all()
    repo_list = [r[0] for r in repos]
    
    # Per-repo issue counts
    repo_stats = []
    for repo_name in repo_list:
        count = db.query(IssueModel).filter(IssueModel.repo_name == repo_name).count()
        cluster_count = db.query(ClusterModel).filter(ClusterModel.repo_name == repo_name).count()
        repo_stats.append({
            "repo": repo_name,
            "issues": count,
            "clusters": cluster_count,
        })
    
    # DB file size
    db_path = "openissue.db"
    db_size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2) if os.path.exists(db_path) else 0

    return {
        "process": {
            "pid": process.pid,
            "cpu_percent": process.cpu_percent(interval=0.1),
            "memory_rss_mb": round(mem_info.rss / (1024 * 1024), 1),
            "memory_vms_mb": round(mem_info.vms / (1024 * 1024), 1),
            "threads": process.num_threads(),
        },
        "system": {
            "cpu_percent_total": psutil.cpu_percent(interval=0.1),
            "memory_percent": psutil.virtual_memory().percent,
            "memory_available_gb": round(psutil.virtual_memory().available / (1024**3), 2),
        },
        "database": {
            "total_issues": total_issues,
            "total_clusters": total_clusters,
            "repos_tracked": len(repo_list),
            "db_size_mb": db_size_mb,
            "repo_breakdown": repo_stats,
        },
        "status": "healthy",
    }
