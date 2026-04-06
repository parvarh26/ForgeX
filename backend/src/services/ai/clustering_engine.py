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

        log.info(f"Running DBSCAN over {len(vectors)} items with eps={self.eps}")
        try:
            clustering = DBSCAN(eps=self.eps, min_samples=self.min_samples, metric='cosine')
            labels = clustering.fit_predict(vectors)
            
            cluster_map = {}
            for index, label in enumerate(labels):
                lbl_int = int(label)
                if lbl_int not in cluster_map:
                    cluster_map[lbl_int] = []
                cluster_map[lbl_int].append(ids[index])
                
            return cluster_map
        except Exception as e:
            log.error(f"Clustering failed: {e}")
