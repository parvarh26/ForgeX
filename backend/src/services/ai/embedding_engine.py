from sentence_transformers import SentenceTransformer
import numpy as np
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.embedding")

class EmbeddingEngine:
    def __init__(self):
