import faiss
import numpy as np
import os
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.vector_store")

class VectorStore:
    def __init__(self, dimension: int):
        self.dimension = dimension
        self.index_path = settings.FAISS_INDEX_PATH
        # We use IndexFlatIP for Cosine Similarity since vectors are normalized L2
        self.index = faiss.IndexFlatIP(self.dimension)
        
        # ID tracking to map internal FAISS index to database IDs
        self.id_map = []
        
        self.load_index()

    def add_vector(self, db_id: int, vector: np.ndarray):
        """Append vector to Faiss index and maintain mapping"""
        try:
            vec_2d = np.array([vector], dtype=np.float32)
            self.index.add(vec_2d)
            self.id_map.append(db_id)
            log.info(f"Added vector for db_id {db_id} to FAISS. Total size: {self.index.ntotal}")
        except Exception as e:
            log.error(f"Failed to add vector to FAISS: {e}")
            raise

    def search_similar(self, vector: np.ndarray, top_k: int = 5):
        """Search top-K nearest neighbors"""
        if self.index.ntotal == 0:
            return []
            
        try:
            vec_2d = np.array([vector], dtype=np.float32)
            distances, indices = self.index.search(vec_2d, top_k)
            
            results = []
            for i, idx in enumerate(indices[0]):
                if idx != -1: 
                    score_percentage = float(distances[0][i])
                    # If same item returns identical score 1.0, we can filter downstream
                    results.append({
                        "db_id": self.id_map[idx],
                        "similarity_score": score_percentage
                    })
            return results
        except Exception as e:
            log.error(f"FAISS search failed: {e}")
            return []

