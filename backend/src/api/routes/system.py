from fastapi import APIRouter
from src.core.config import settings
from src.services.ai.llm_service import llm
import time
import psutil

router = APIRouter()

@router.get("/status")
async def get_system_status():
    """
    Returns real-time telemetry for the Backend Status dashboard tab.
    """
    # CPU/RAM metrics
    cpu_usage = psutil.cpu_percent()
    ram_usage = psutil.virtual_memory().percent
    
    # LLM Provider health
    llm_health = "active" if settings.LLM_PROVIDER != "mock" or settings.LLM_API_KEY else "simulation"
    
    return {
