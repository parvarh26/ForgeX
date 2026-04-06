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
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Global Exception Handlers (SDE-3 practice)
    app.add_exception_handler(IntelligenceError, intelligence_exception_handler)
