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
