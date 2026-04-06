import faiss
import numpy as np
import os
import json
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.vector_store")

class VectorStore:
    def __init__(self, dimension: int, repo_name: str):
        self.dimension = dimension
        self.repo_name = repo_name.replace("/", "_")
        self.storage_dir = settings.FAISS_STORAGE_DIR
        
        # Paths for persistence
        self.index_file = os.path.join(self.storage_dir, f"{self.repo_name}.index")
        self.map_file = os.path.join(self.storage_dir, f"{self.repo_name}.json")
        
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
            log.info(f"Added vector for db_id {db_id} to FAISS ({self.repo_name})")
            self.save_index() # Persist immediately for durability
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
                    results.append({
                        "db_id": self.id_map[idx],
                        "similarity_score": score_percentage
                    })
            return results
        except Exception as e:
            log.error(f"FAISS search failed: {e}")
            return []

    def get_all_vectors(self):
        """Used for clustering engine"""
        if self.index.ntotal == 0:
            return np.empty((0, self.dimension)), []
        
        vectors = np.array([self.index.reconstruct(i) for i in range(self.index.ntotal)])
        return vectors, self.id_map

    def save_index(self):
        """Persist index and ID map to disk"""
        try:
            if not os.path.exists(self.storage_dir):
                os.makedirs(self.storage_dir)
            
            faiss.write_index(self.index, self.index_file)
            with open(self.map_file, "w") as f:
                json.dump(self.id_map, f)
            log.info(f"Persisted FAISS index for {self.repo_name}")
        except Exception as e:
            log.error(f"Failed to save FAISS index: {e}")

    def load_index(self):
        """Restore index and ID map from disk if they exist"""
        try:
            if os.path.exists(self.index_file) and os.path.exists(self.map_file):
                self.index = faiss.read_index(self.index_file)
                with open(self.map_file, "r") as f:
                    self.id_map = json.load(f)
                log.info(f"Successfully restored FAISS index for {self.repo_name} ({self.index.ntotal} vectors)")
            else:
                log.info(f"No existing index found for {self.repo_name}. Initialized ephemeral.")
        except Exception as e:
            log.error(f"Failed to load FAISS index: {e}")

    def clear_storage(self):
        """Permanently delete FAISS data from disk for this repo."""
        try:
            if os.path.exists(self.index_file):
                os.remove(self.index_file)
            if os.path.exists(self.map_file):
                os.remove(self.map_file)
            log.info(f"Successfully cleared disk storage for {self.repo_name}")
        except Exception as e:
            log.error(f"Failed to clear storage for {self.repo_name}: {e}")
            raise

# This will be dependency injected with the engine dimension
store = None
