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
    app.add_exception_handler(Exception, global_exception_handler)

    # Routes
    app.include_router(issues.router, prefix="/api/v1/issues", tags=["Issues"])
    app.include_router(clusters.router, prefix="/api/v1/clusters", tags=["Clusters"])
    # SSE streaming GitHub sync — the core of plan.md
    app.include_router(github.router, prefix="/api/v1/github", tags=["GitHub"])
    # System telemetry for Dashboard status
    app.include_router(system.router, prefix="/api/v1/system", tags=["System"])

    @app.on_event("startup")
    async def startup_event():
        log.info("Booting Intelligence Pipeline...")
        # Dependency Injection of singletons mapped to routers
        issues.v_store = VectorStore(dimension=embedder.dimension)
        log.info("Vector Store dynamically linked.")

    @app.get("/health")
    def health_check():
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
