from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
import os

# Graceful degradation to SQLite — no Docker requirement for local development
engine = create_engine(
    "sqlite:///./openissue.db", connect_args={"check_same_thread": False}
)

# 🛡️ Hardening: Enable WAL Mode and NORMAL Synchronous for performance & concurrency
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

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
    github_updated_at = Column(String) # Store ISO string from GitHub to use for 'since=' query
    labels = Column(String, nullable=True) # Comma-separated list of GitHub labels
    state = Column(String, default="open") # current state of the issue on GitHub

class ClusterModel(Base):
    __tablename__ = "clusters"
    
    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False, default="unknown")
    cluster_label = Column(Integer, index=True)
    size = Column(Integer)
    urgency = Column(String)
    summary_insight = Column(String)
    llm_full_analysis = Column(String)
    similarity_score = Column(Float)
    github_issue_numbers = Column(String) # Comma-separated list

class IssueTriage(Base):
    __tablename__ = "issue_triage"
    
    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False)
    issue_number = Column(Integer, index=True, nullable=False)
    priority = Column(String, nullable=True)          # p0, p1, p2, p3
    triage_status = Column(String, default="needs-triage")  # needs-triage, triaged, needs-repro, backlog
    bookmarked = Column(Integer, default=0)           # 0 or 1
    pinned = Column(Integer, default=0)               # 0 or 1
    locked = Column(Integer, default=0)               # 0 or 1
    linked_pr = Column(String, nullable=True)         # PR number if linked
    notes = Column(String, nullable=True)             # Internal notes
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

# Init DB — runs at import time to ensure schema is always current
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
