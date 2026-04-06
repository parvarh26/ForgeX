from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
import os

# Graceful degradation to SQLite — no Docker requirement for local development
engine = create_engine(
    "sqlite:///./openissue.db", connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class IssueModel(Base):
    __tablename__ = "issues"

    id = Column(Integer, primary_key=True, index=True)
    # Multi-tenant boundary: every issue is scoped to its origin repo — plan.md §5.1
    repo_name = Column(String, index=True, nullable=False, default="unknown")
    # GitHub's own issue number for deduplication
    github_issue_id = Column(Integer, index=True, nullable=True)
    title = Column(String, index=True)
    body = Column(String)
    priority_score = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ClusterModel(Base):
    __tablename__ = "clusters"
    
    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False, default="unknown")
    summary_insight = Column(String)
    size = Column(Integer)
    urgency = Column(String)

# Init DB — runs at import time to ensure schema is always current
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

