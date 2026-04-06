from sklearn.cluster import DBSCAN
import numpy as np
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.clustering")

class ClusteringEngine:
    def __init__(self, eps=None, min_samples=None):
        self.eps = eps or settings.DBSCAN_EPS
        self.min_samples = min_samples or settings.DBSCAN_MIN_SAMPLES

    def compute_clusters(self, vectors: np.ndarray, ids: list):
        """
        Runs DBSCAN on the vectors and returns a mapping of Cluster IDs to Issue DB IDs.
        Cluster -1 is noise.
        """
        if len(vectors) == 0:
            return {}

        # FIX: Need at least min_samples vectors for any cluster to form
        if len(vectors) < self.min_samples:
            log.warning(f"Too few vectors ({len(vectors)}) for DBSCAN min_samples={self.min_samples}. Skipping clustering.")
            return {}

        # FIX: Guard against NaN/Inf vectors produced by zero-norm embeddings.
        # DBSCAN with cosine metric raises ValueError: Input contains NaN on these.
        has_nan = np.isnan(vectors).any(axis=1)
        has_inf = np.isinf(vectors).any(axis=1)
        invalid_mask = has_nan | has_inf
        if invalid_mask.any():
            bad_count = int(invalid_mask.sum())
            log.warning(f"Dropping {bad_count} invalid vectors (NaN/Inf) before clustering.")
            valid_indices = np.where(~invalid_mask)[0]
            vectors = vectors[valid_indices]
            ids = [ids[i] for i in valid_indices]

        if len(vectors) < 2:
            log.warning(f"After filtering invalid vectors, only {len(vectors)} remain. Cannot cluster.")
            return {}

        log.info(f"Running DBSCAN over {len(vectors)} items with eps={self.eps}, min_samples={self.min_samples}")
        try:
            clustering = DBSCAN(eps=self.eps, min_samples=self.min_samples, metric='cosine')
            labels = clustering.fit_predict(vectors)
            
            cluster_map = {}
            for index, label in enumerate(labels):
                lbl_int = int(label)
                if lbl_int not in cluster_map:
                    cluster_map[lbl_int] = []
                cluster_map[lbl_int].append(ids[index])
            
            noise_count = len(cluster_map.get(-1, []))
            cluster_count = len([k for k in cluster_map if k != -1])
            log.info(f"DBSCAN complete: {cluster_count} clusters, {noise_count} noise points")
            return cluster_map

        except MemoryError:
            log.error(
                f"DBSCAN OOM on {len(vectors)} vectors. "
                f"This repo is too large for exact DBSCAN. Consider switching to HDBSCAN or k-means for repos > 10k issues."
            )
            return {}
        except Exception as e:
            log.error(f"Clustering failed: {e}")
            return {}  # Fail open — return no clusters, don't corrupt DB

clusterer = ClusteringEngine()
