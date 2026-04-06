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
