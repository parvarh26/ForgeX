from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.core.config import settings
from src.core.logger import log
from src.core.exceptions import IntelligenceError, intelligence_exception_handler, global_exception_handler
from src.api.routes import issues, clusters
from src.api.routes import github, system, ai_search

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
    app.include_router(github.router, prefix="/api/v1/github", tags=["GitHub"])
    app.include_router(ai_search.router, prefix="/api/v1/ai", tags=["AI Search"])
    app.include_router(system.router, prefix="/api/v1/system", tags=["System"])

    @app.on_event("startup")
    async def startup_event():
        log.info("Booting Intelligence Pipeline...")
        # FIX: Crash recovery — any sync marked 'syncing' in DB means the server
        # was killed mid-crawl. Mark them as 'failed' so the UI knows to re-sync.
        try:
            from src.db.models import SessionLocal, SyncState
            db = SessionLocal()
            try:
                stuck = db.query(SyncState).filter(SyncState.status == "syncing").all()
                if stuck:
                    for s in stuck:
                        log.warning(f"[startup] Found crashed sync for '{s.repo_name}', marking failed.")
                        s.status = "failed"
                        s.last_error = "Server restarted while sync was in progress"
                    db.commit()
            finally:
                db.close()
        except Exception as e:
            log.warning(f"[startup] Could not run sync recovery: {e}")


    @app.get("/health")
    def health_check():
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    return app

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
