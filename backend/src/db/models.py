from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, UniqueConstraint, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
import os

# Graceful degradation to SQLite — no Docker requirement for local development
engine = create_engine(
    "sqlite:///./openissue.db", connect_args={"check_same_thread": False}
)

# Hardening: Enable WAL Mode and NORMAL Synchronous for performance & concurrency
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class IssueModel(Base):
    __tablename__ = "issues"
    # FIX: Added UniqueConstraint to prevent duplicate rows under concurrent syncs (TOCTOU race).
    # Previously only github_issue_id was indexed, not unique — double-click sync = duplicate rows.
    __table_args__ = (
        UniqueConstraint("repo_name", "github_issue_id", name="uq_repo_issue"),
    )

    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False, default="unknown")
    github_issue_id = Column(Integer, index=True, nullable=True)
    title = Column(String, index=True)
    body = Column(String)
    priority_score = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    github_updated_at = Column(String)  # ISO string from GitHub, used for 'since=' query
    labels = Column(String, nullable=True)  # Comma-separated GitHub label names
    state = Column(String, default="open")  # current state on GitHub

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
    github_issue_numbers = Column(String)  # Comma-separated list

class IssueTriage(Base):
    __tablename__ = "issue_triage"
    # FIX: Added UniqueConstraint to prevent two triage rows for the same issue
    __table_args__ = (
        UniqueConstraint("repo_name", "issue_number", name="uq_repo_triage"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False)
    issue_number = Column(Integer, index=True, nullable=False)
    priority = Column(String, nullable=True)          # p0, p1, p2, p3
    triage_status = Column(String, default="needs-triage")
    bookmarked = Column(Integer, default=0)
    pinned = Column(Integer, default=0)
    locked = Column(Integer, default=0)
    linked_pr = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class SyncState(Base):
    """
    FIX: Persists sync progress to SQLite so the system knows its state across restarts.
    Previously: _sync_status was a module-level dict lost on every server restart.
    Now: On startup, any row with status='syncing' is flipped to 'failed' (it died mid-flight).
    """
    __tablename__ = "sync_state"
    __table_args__ = (
        UniqueConstraint("repo_name", name="uq_syncstate_repo"),
    )

    id = Column(Integer, primary_key=True, index=True)
    repo_name = Column(String, index=True, nullable=False)
    status = Column(String, default="idle")  # idle | syncing | failed | complete
    last_sync_started = Column(DateTime(timezone=True), nullable=True)
    last_sync_completed = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String, nullable=True)
    issues_processed = Column(Integer, default=0)
    clusters_created = Column(Integer, default=0)

# Init DB — runs at import time to ensure schema is always current
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
