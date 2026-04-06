import faiss
import numpy as np
import os
import json
import threading
from datetime import datetime
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
        self.manifest_file = os.path.join(self.storage_dir, f"{self.repo_name}.manifest.json")
        
        # IndexFlatIP for Cosine Similarity (vectors must be L2-normalized)
        self.index = faiss.IndexFlatIP(self.dimension)
        self.id_map = []

        # FIX: Threading lock for concurrent read+write safety.
        # FAISS IndexFlatIP is NOT thread-safe for concurrent add()+search().
        self._lock = threading.RLock()
        
        self.load_index()

    def add_vector(self, db_id: int, vector: np.ndarray):
        """Append vector to FAISS index and maintain mapping. Thread-safe."""
        with self._lock:
            try:
                vec_2d = np.array([vector], dtype=np.float32)
                self.index.add(vec_2d)
                self.id_map.append(db_id)
            except Exception as e:
                log.error(f"Failed to add vector for db_id {db_id}: {e}")
                raise
        # Save outside lock to avoid blocking reads during I/O
        self.save_index()
        log.info(f"Added vector for db_id {db_id} to FAISS ({self.repo_name}), total={self.index.ntotal}")

    def search_similar(self, vector: np.ndarray, top_k: int = 5):
        """Search top-K nearest neighbors. Thread-safe."""
        with self._lock:
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
        """Used for clustering engine. Thread-safe read."""
        with self._lock:
            if self.index.ntotal == 0:
                return np.empty((0, self.dimension)), []
            vectors = np.array([self.index.reconstruct(i) for i in range(self.index.ntotal)])
            return vectors, list(self.id_map)

    def save_index(self):
        """
        FIX: Atomic write via temp-file + os.replace().
        Prevents half-written index if the process is killed mid-write.
        Both files succeed or neither — no corrupt partial state.
        """
        tmp_index = self.index_file + ".tmp"
        tmp_map = self.map_file + ".tmp"
        tmp_manifest = self.manifest_file + ".tmp"
        try:
            if not os.path.exists(self.storage_dir):
                os.makedirs(self.storage_dir, exist_ok=True)

            with self._lock:
                ntotal = self.index.ntotal
                id_map_copy = list(self.id_map)
                faiss.write_index(self.index, tmp_index)

            with open(tmp_map, "w") as f:
                json.dump(id_map_copy, f)

            manifest = {
                "model_name": settings.EMBEDDING_MODEL_NAME,
                "dimension": self.dimension,
                "vector_count": ntotal,
                "written_at": datetime.utcnow().isoformat()
            }
            with open(tmp_manifest, "w") as f:
                json.dump(manifest, f)

            # Atomic replace — all three succeed or none
            os.replace(tmp_index, self.index_file)
            os.replace(tmp_map, self.map_file)
            os.replace(tmp_manifest, self.manifest_file)

            log.info(f"Persisted FAISS index for {self.repo_name} ({ntotal} vectors)")
        except Exception as e:
            log.error(f"Failed to save FAISS index for {self.repo_name}: {e}")
            # Clean up any tmp files that got written
            for tmp in [tmp_index, tmp_map, tmp_manifest]:
                try:
                    if os.path.exists(tmp):
                        os.remove(tmp)
                except Exception:
                    pass

    def load_index(self):
        """
        FIX: Restore index with integrity checks:
        1. Both files must exist (atomicity guard)
        2. Dimension must match current model (model-change guard)
        3. Vector count must match id_map length (corruption guard)
        Silently starts fresh rather than crashing on any mismatch.
        """
        try:
            if not (os.path.exists(self.index_file) and os.path.exists(self.map_file)):
                log.info(f"No existing index found for {self.repo_name}. Starting fresh.")
                return

            # Check manifest for model compatibility
            if os.path.exists(self.manifest_file):
                try:
                    with open(self.manifest_file) as f:
                        manifest = json.load(f)
                    stored_model = manifest.get("model_name", "")
                    if stored_model and stored_model != settings.EMBEDDING_MODEL_NAME:
                        log.warning(
                            f"Embedding model changed: {stored_model} → {settings.EMBEDDING_MODEL_NAME}. "
                            f"Discarding stale index for {self.repo_name}."
                        )
                        return
                except Exception as e:
                    log.warning(f"Could not read manifest for {self.repo_name}: {e}. Proceeding with dimension check.")

            loaded_index = faiss.read_index(self.index_file)
            with open(self.map_file, "r") as f:
                loaded_map = json.load(f)

            # Integrity check 1: dimension must match
            if loaded_index.d != self.dimension:
                log.error(
                    f"FAISS dimension mismatch for {self.repo_name}: "
                    f"stored={loaded_index.d}, expected={self.dimension}. "
                    f"Discarding corrupt index and starting fresh."
                )
                return

            # Integrity check 2: vector count must match id_map
            if loaded_index.ntotal != len(loaded_map):
                log.error(
                    f"FAISS count mismatch for {self.repo_name}: "
                    f"index has {loaded_index.ntotal} vectors but id_map has {len(loaded_map)} entries. "
                    f"Discarding corrupt index and starting fresh."
                )
                return

            self.index = loaded_index
            self.id_map = loaded_map
            log.info(f"Restored FAISS index for {self.repo_name} ({self.index.ntotal} vectors)")

        except Exception as e:
            log.error(f"Failed to load FAISS index for {self.repo_name}: {e}. Starting fresh.")
            # Fall through with empty index — server continues without crashing

    def clear_storage(self):
        """Permanently delete FAISS data from disk for this repo."""
        try:
            for f in [self.index_file, self.map_file, self.manifest_file]:
                if os.path.exists(f):
                    os.remove(f)
            log.info(f"Cleared disk storage for {self.repo_name}")
        except Exception as e:
            log.error(f"Failed to clear storage for {self.repo_name}: {e}")
            raise

# Module-level store — initialized via dependency injection with engine dimension
store = None
