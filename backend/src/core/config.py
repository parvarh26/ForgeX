from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "OpenIssue Intelligence API"
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql://openissue:devpassword@postgres:5432/openissue"
