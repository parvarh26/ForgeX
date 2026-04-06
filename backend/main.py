from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.core.config import settings
from src.core.logger import log
from src.core.exceptions import IntelligenceError, intelligence_exception_handler, global_exception_handler
from src.api.routes import issues, clusters
from src.api.routes import github, system
from src.services.ai.vector_store import VectorStore
from src.services.ai.embedding_engine import engine as embedder

def create_app() -> FastAPI:
    app = FastAPI(title=settings.PROJECT_NAME)
    
    # CORS specifically configured for the Vite Dev Server
    app.add_middleware(
        CORSMiddleware,
