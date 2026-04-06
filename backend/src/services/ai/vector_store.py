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
