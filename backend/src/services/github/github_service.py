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

    def _build_headers(self) -> dict:
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "OpenIssue-Intelligence-Engine/1.0",
        }
        token = settings.GITHUB_TOKEN
        if token:
            headers["Authorization"] = f"Bearer {token}"
            log.info("GitHub request authenticated with GITHUB_TOKEN.")
        else:
            log.warning("No GITHUB_TOKEN set — using unauthenticated mode (60 req/hr cap).")
        return headers

    async def fetch_issues(self, repo: str, limit: int = 200) -> List[Dict]:
        """
        Pulls up to `limit` open issues from `owner/repo` using pagination.
        Filters out pull requests.
        """
        if "/" not in repo or len(repo.split("/")) != 2:
            raise ValueError(f"Invalid repo format: '{repo}'. Expected 'owner/repo'.")

        all_cleaned = []
        page = 1
