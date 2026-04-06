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
