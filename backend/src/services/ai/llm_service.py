from src.core.config import settings
from src.core.logger import setup_logger
import re
from collections import Counter

log = setup_logger("openissue.llm")

# Common stop words to exclude from keyword extraction
_STOP_WORDS = {
    "the", "a", "an", "is", "in", "on", "at", "to", "for", "of", "and", "or",
    "but", "when", "with", "this", "that", "it", "be", "not", "error", "issue",
    "bug", "fix", "problem", "feature", "request", "using", "use", "after",
    "cannot", "can", "does", "do", "from", "has", "have", "are", "was", "were"
}

class LLMService:
    def __init__(self):
        self.provider = settings.LLM_PROVIDER
        log.info(f"Initializing LLM Service with provider: {self.provider}")

    def _extract_keywords(self, texts: list[str], top_n: int = 4) -> list[str]:
        """Extract top frequency technical keywords from a cluster's real issue text."""
        combined = " ".join(texts).lower()
        # Keep only alphanumeric tokens of length >= 3
        tokens = re.findall(r'\b[a-z][a-z0-9]{2,}\b', combined)
        filtered = [t for t in tokens if t not in _STOP_WORDS]
        most_common = Counter(filtered).most_common(top_n)
        return [word for word, _ in most_common]

    def generate_cluster_insight(self, context_texts: list[str]) -> str:
        """
        Generates a 1-sentence actionable insight derived from the actual
        titles/bodies of clustered issues.
        Falls back to mock heuristic if LLM provider is 'mock' or no API key.
        """
        if not context_texts:
            return "Unable to determine trend context."

        keywords = self._extract_keywords(context_texts)
        keyword_str = ", ".join(keywords) if keywords else "recurring pattern"

        if self.provider == "mock" or not settings.LLM_API_KEY:
            # Deterministic insight derived from real extracted text
            combined = " ".join(context_texts).lower()

            if any(k in combined for k in ["auth", "login", "oauth", "token", "session"]):
                return f"Authentication failure cluster detected — recurring pattern in: {keyword_str}."
            if any(k in combined for k in ["hydration", "ssr", "server-side", "react", "render"]):
                return f"React rendering alignment issue identified — pattern: {keyword_str}."
            if any(k in combined for k in ["timeout", "504", "connection", "network", "slow"]):
                return f"Network latency / timeout cluster surfaced — affecting: {keyword_str}."
            if any(k in combined for k in ["memory", "leak", "oom", "heap", "crash"]):
                return f"Memory pressure cluster detected — critical pattern in: {keyword_str}."
            if any(k in combined for k in ["mobile", "ios", "android", "viewport", "responsive"]):
