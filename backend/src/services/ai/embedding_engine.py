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
