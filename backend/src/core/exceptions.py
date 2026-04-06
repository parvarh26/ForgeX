from fastapi import Request, status
from fastapi.responses import JSONResponse
from .logger import log

class IntelligenceError(Exception):
    """Base exception for AI engine failures."""
