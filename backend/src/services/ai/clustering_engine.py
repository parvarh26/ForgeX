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
