import httpx
import asyncio
from typing import Optional, List, Dict
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.github")

GITHUB_API_BASE = "https://api.github.com"

class GitHubService:
    """
    Async GitHub REST API client.
    Fetches open issues for a given `owner/repo` slug with industrial-scale pagination.
    """

