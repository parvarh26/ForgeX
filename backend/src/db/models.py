from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.sql import func
import os

# Graceful degradation to SQLite — no Docker requirement for local development
engine = create_engine(
    "sqlite:///./openissue.db", connect_args={"check_same_thread": False}
)
