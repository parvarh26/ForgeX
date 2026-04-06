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
        per_page = 100 # GitHub max

        async with httpx.AsyncClient(timeout=30.0) as client:
            while len(all_cleaned) < limit:
                url = f"{GITHUB_API_BASE}/repos/{repo}/issues"
                params = {
                    "state": "open",
                    "per_page": per_page,
                    "page": page,
                    "sort": "created",
                    "direction": "desc"
                }

                log.info(f"Fetching page {page} of issues from {repo}...")
                response = await client.get(url, headers=self._build_headers(), params=params)

                if response.status_code == 404:
                    raise ValueError(f"Repository '{repo}' not found on GitHub.")
                if response.status_code == 403:
                    raise ValueError(f"GitHub API rate limit exceeded. Set GITHUB_TOKEN for higher quota.")
                if response.status_code != 200:
                    raise ValueError(f"GitHub API error {response.status_code}: {response.text[:200]}")

                raw_batch = response.json()
                if not raw_batch:
                    break # No more results

                # Filter and clean
                for item in raw_batch:
                    if "pull_request" not in item:
                        all_cleaned.append({
                            "github_issue_id": item.get("number"),
