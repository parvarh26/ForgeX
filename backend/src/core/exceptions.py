from fastapi import Request, status
from fastapi.responses import JSONResponse
from .logger import log

class IntelligenceError(Exception):
    """Base exception for AI engine failures."""
    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        self.message = message
        self.status_code = status_code

async def intelligence_exception_handler(request: Request, exc: IntelligenceError):
    log.error(f"Intelligence processing failed: {exc.message} for path {request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": exc.message}}
    )

async def global_exception_handler(request: Request, exc: Exception):
