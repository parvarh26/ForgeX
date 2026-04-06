from src.core.config import settings
from src.core.logger import setup_logger
import re
from collections import Counter

log = setup_logger("openissue.llm")

# Common stop words to exclude from keyword extraction
_STOP_WORDS = {
