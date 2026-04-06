from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "OpenIssue Intelligence API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://openissue:devpassword@postgres:5432/openissue"
    REDIS_URL: str = "redis://redis:6379/0"
    
    # AI Config
    EMBEDDING_MODEL_NAME: str = "all-MiniLM-L6-v2"
    FAISS_INDEX_PATH: str = "faiss_index.bin"
    # Epsilon=0.28 isolates micro-trends per plan.md §6.2
    DBSCAN_EPS: float = 0.28
    DBSCAN_MIN_SAMPLES: int = 2
    
    # LLM Config
    LLM_API_KEY: Optional[str] = None # Set this in .env (GROQ_API_KEY)
    LLM_PROVIDER: str = "groq" # options: "mock", "groq"
    LLM_MODEL: str = "gemma4-26b-it"

    # GitHub API Config — set GITHUB_TOKEN in .env for higher rate limits
    GITHUB_TOKEN: Optional[str] = None 

    FAISS_STORAGE_DIR: str = "storage/vector_indices"

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
