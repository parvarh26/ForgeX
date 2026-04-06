from fastapi import APIRouter
from src.core.config import settings
from src.services.ai.llm_service import llm
import time
import psutil

router = APIRouter()
