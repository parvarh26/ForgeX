import faiss
import numpy as np
import os
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.vector_store")

class VectorStore:
