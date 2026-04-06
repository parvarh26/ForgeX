from sentence_transformers import SentenceTransformer
import numpy as np
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.embedding")

class EmbeddingEngine:
    def __init__(self):
        try:
            log.info(f"Loading embedding model {settings.EMBEDDING_MODEL_NAME}...")
            self.model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
            self.dimension = self.model.get_sentence_embedding_dimension()
            log.info(f"Model loaded with dimension {self.dimension}")
        except Exception as e:
            log.error(f"Failed to load sentence-transformer: {e}")
            raise

    def generate_embedding(self, text: str) -> np.ndarray:
        """Convert a single cleaned text string to a normalized dense vector."""
        try:
            vector = self.model.encode([text], convert_to_numpy=True)[0]
            norm = np.linalg.norm(vector)
            if norm > 0:
                vector = vector / norm
            return vector
        except Exception as e:
            log.error(f"Failed to generate embedding for text snippet: {e}")
            raise

    def generate_embeddings(self, texts: list) -> list:
        """
        Batch encode a list of text strings into normalized dense vectors.
        This is the method handed off to run_in_threadpool for chunked processing
        per plan.md §4.1 — isolates CPU-bound PyTorch math from the async event loop.
        """
        try:
            log.info(f"Batch encoding {len(texts)} texts in thread-pool...")
            vectors = self.model.encode(texts, convert_to_numpy=True)
            normalized = []
            for v in vectors:
                norm = np.linalg.norm(v)
                normalized.append(v / norm if norm > 0 else v)
            return normalized
        except Exception as e:
