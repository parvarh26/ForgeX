from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.core.config import settings
from src.core.logger import log
from src.core.exceptions import IntelligenceError, intelligence_exception_handler, global_exception_handler
from src.api.routes import issues, clusters
from src.api.routes import github, system
from src.services.ai.vector_store import VectorStore
