import httpx
import asyncio
import re
from typing import Optional, List, Dict
from src.core.logger import setup_logger
from src.core.config import settings

log = setup_logger("openissue.github")

GITHUB_API_BASE = "https://api.github.com"
REPO_SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$")

class GitHubService:
    """
    Async GitHub REST API client.
    Fetches open issues for a given `owner/repo` slug with industrial-scale pagination.
    """

    def _validate_repo(self, repo: str):
        if not REPO_SLUG_PATTERN.match(repo):
            raise ValueError(f"Security: Malicious repository slug detected: '{repo}'. Format must be owner/repo.")

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

    async def fetch_repo_metadata(self, repo: str) -> dict:
        """
        Fetches repository metadata, specifically useful for getting the exact open issue count.
        """
        self._validate_repo(repo)

        async with httpx.AsyncClient(timeout=15.0) as client:

            url = f"{GITHUB_API_BASE}/repos/{repo}"
            response = await client.get(url, headers=self._build_headers())
            
            if response.status_code == 404:
                raise ValueError(f"Repository '{repo}' not found on GitHub.")
            if response.status_code != 200:
                raise ValueError(f"GitHub API error {response.status_code}: {response.text[:200]}")
            
            data = response.json()
            return {
                "open_issues_count": data.get("open_issues_count", 0),
                "name": data.get("full_name")
            }

    async def fetch_issues_stream(self, repo: str, limit: Optional[int] = None, since: Optional[str] = None):
        """
        Yields batches of open issues from `owner/repo` using pagination.
        Filters out pull requests. Accepts 'since' as ISO 8601 string for incremental sync.
        """
        if "/" not in repo or len(repo.split("/")) != 2:
            raise ValueError(f"Invalid repo format: '{repo}'. Expected 'owner/repo'.")

        page = 1
        per_page = 100 # GitHub max
        total_yielded = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            while limit is None or total_yielded < limit:
                url = f"{GITHUB_API_BASE}/repos/{repo}/issues"
                params = {
                    "state": "open",
                    "per_page": per_page,
                    "page": page,
                    "sort": "updated",
                    "direction": "asc" # Fetch oldest updated first when doing incremental
                }
                if since:
                    params["since"] = since

                log.info(f"Fetching page {page} of issues from {repo}...")
                response = await client.get(url, headers=self._build_headers(), params=params)

                if response.status_code == 404:
                    raise ValueError(f"Repository '{repo}' not found on GitHub.")
                if response.status_code == 403:
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        log.warning(f"GitHub secondary rate limit hit. Sleeping for {retry_after}s...")
                        await asyncio.sleep(int(retry_after))
                        continue
                    
                    auth_err = "GitHub API rate limit exceeded."
                    if not settings.GITHUB_TOKEN:
                        auth_err = "CRITICAL: GitHub Rate Limit Exceeded (60/hr). To sync large repositories like VS Code, you MUST provide a GITHUB_TOKEN in backend/.env. See backend/.env.template for help."
                    raise ValueError(auth_err)
                    
                if response.status_code != 200:
                    raise ValueError(f"GitHub API error {response.status_code}: {response.text[:200]}")

                raw_batch = response.json()
                if not raw_batch:
                    break # No more results

                # Filter and clean
                cleaned_batch = []
                for item in raw_batch:
                    # plan.md §3.4 — Robust Failsafe: Filter out Pull Requests
                    if "pull_request" in item:
                        continue

                    # GitHub returns labels as a list of objects; map to simple string
                    label_names = [L.get("name") for L in item.get("labels", [])]
                    
                    cleaned_batch.append({
                        "github_issue_id": item.get("number"),
                        "title": item.get("title", "").strip(),
                        "body": (item.get("body") or "").strip()[:2000],
                        "updated_at": item.get("updated_at"),
                        "labels": ", ".join(label_names) if label_names else None,
                        "state": item.get("state", "open")
                    })
                    
                    # If we reached the limit, break the inner loop
                    if limit is not None and total_yielded + len(cleaned_batch) >= limit:
                        break
                            
                total_yielded += len(cleaned_batch)
                
                if cleaned_batch:
                    yield cleaned_batch
                
                page += 1
                # Small safety delay to avoid hitting primary rate limits too fast
                await asyncio.sleep(0.1)

        log.info(f"Industrial fetch complete: {total_yielded} issues stream finished for {repo}.")


# Module-level singleton
github_service = GitHubService()
