from sentence_transformers import SentenceTransformer
import numpy as np
import threading
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
        Called via run_in_threadpool() to isolate CPU-bound PyTorch from the async event loop.
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
            log.error(f"Batch embedding failed: {e}")
            raise


# FIX: Lazy singleton — defer model loading until first use.
# Previously: engine = EmbeddingEngine() at import time → if model download fails,
# the entire backend crashes on startup with no health endpoint available.
# Now: model loads on first call; server starts cleanly even without connectivity.
_engine_instance: EmbeddingEngine | None = None
_engine_lock = threading.Lock()

def get_embedding_engine() -> EmbeddingEngine:
    """Thread-safe lazy initialization of the embedding model singleton."""
    global _engine_instance
    if _engine_instance is None:
        with _engine_lock:
            if _engine_instance is None:  # Double-checked locking
                _engine_instance = EmbeddingEngine()
    return _engine_instance

# Back-compat alias for code that imports `engine` directly
# (embedding_engine.py used to export `engine = EmbeddingEngine()`)
class _LazyEngineProxy:
    """Transparent proxy to the lazy singleton so existing `engine.xxx` calls work unchanged."""
    def __getattr__(self, name):
        return getattr(get_embedding_engine(), name)

engine = _LazyEngineProxy()
