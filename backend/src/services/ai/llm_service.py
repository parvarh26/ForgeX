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

    async def generate_cluster_insight(self, context_texts: list[str]) -> str:
        """
        Generates a 1-sentence actionable insight derived from the actual
        titles/bodies of clustered issues using Gemma 2 (via Groq).
        Falls back to keyword-based heuristic if API key is missing.
        """
        if not context_texts:
            return "Unable to determine trend context."

        keywords = self._extract_keywords(context_texts)
        keyword_str = ", ".join(keywords) if keywords else "recurring pattern"

        # Check for absolute requirement (provider is groq AND api key is set)
        if self.provider == "groq" and settings.LLM_API_KEY:
            try:
                import httpx
                
                # Combine issue data for context (expanded to 15 issues for Gemma 4's efficiency)
                # Including real labels and state for zero-simulation analysis
                context_payloads = []
                for t in context_texts[:15]:
                    # The context_texts passed from github.py is currently just strings;
                    # We might want to pass objects later, but for now we'll assume they 
                    # are already formatted or we'll just use the raw text.
                    context_payloads.append(f"Issue: {t[:600]}")
                
                corpus = "\n---\n".join(context_payloads)
                
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.LLM_API_KEY}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": settings.LLM_MODEL,
                            "messages": [
                                {
                                    "role": "system", 
                                    "content": f"You are the {settings.LLM_MODEL} Deep Intelligence Engine. Analyze this cluster of GitHub issues including their labels and state. Provide a single, extremely high-density technical summary (max 15 words). Focus on architectural root causes."
                                },
                                {
                                    "role": "user", 
                                    "content": f"Issue Cluster Data (15 samples):\n{corpus}"
                                }
                            ],
                            "temperature": 0.1,
                            "max_tokens": 60
                        }
                    )
                    
                    if response.status_code == 200:
                        content = response.json()
                        insight = content['choices'][0]['message']['content'].strip()
                        # Strip any quotes if the LLM adds them
                        return insight.strip('"').strip("'")
                    else:
                        log.error(f"Groq API Error: {response.status_code} - {response.text}")
                        # Fall through to mock logic
            except Exception as e:
                log.error(f"Failed to fetch AI insight: {e}")
                # Fall through to mock logic

        # MOCK LOGIC (Fallback or default)
        combined = " ".join(context_texts).lower()

        if any(k in combined for k in ["auth", "login", "oauth", "token", "session"]):
            return f"Authentication failure cluster detected — pattern in: {keyword_str}."
        if any(k in combined for k in ["hydration", "ssr", "server-side", "react", "render"]):
            return f"React rendering alignment issue identified — pattern: {keyword_str}."
        if any(k in combined for k in ["timeout", "504", "connection", "network", "slow"]):
            return f"Network latency / timeout cluster surfaced — affecting: {keyword_str}."
        if any(k in combined for k in ["ui", "css", "layout", "responsive", "overlap"]):
            return f"UI structural conflicts detected — pattern: {keyword_str}."
        if any(k in combined for k in ["memory", "leak", "oom", "crash"]):
            return f"Critical resource exhaustion pattern identified — keywords: {keyword_str}."
        if any(k in combined for k in ["docker", "build", "ci", "pipeline", "deploy"]):
            return f"Deployment sequence failure cluster — pattern in: {keyword_str}."

        return f"General structural issue mapped across keywords: {keyword_str}."

    async def answer_semantic_query(self, query: str, context_texts: list[str]) -> str:
        """
        AI Semantic Search routing. Instructs Gemma 4 to answer a maintainer's 
        question conversationally using ONLY the provided FAISS context matches.
        """
        if not context_texts:
            return "I couldn't find any relevant issues in the spatial matrix to answer that."

        if self.provider == "groq" and settings.LLM_API_KEY:
            try:
                import httpx
                corpus = "\n---\n".join(context_texts)
                
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={
                            "Authorization": f"Bearer {settings.LLM_API_KEY}",
                            "Content-Type": "application/json"
                        },
                        json={
                            "model": settings.LLM_MODEL,
                            "messages": [
                                {
                                    "role": "system", 
                                    "content": f"You are the OpenIssue AI Assistant. You answer questions from open-source maintainers based on the provided repository issues. \n\nRULES:\n1. Answer conversationally but professionally.\n2. You MUST cite the source issue numbers (e.g., 'As seen in Issue #423...') when referencing them.\n3. Do not invent information. If the context does not contain the answer, say so."
                                },
                                {
                                    "role": "user", 
                                    "content": f"Context Issues:\n{corpus}\n\nMaintainer Question: {query}"
                                }
                            ],
                            "temperature": 0.2,
                            "max_tokens": 400
                        }
                    )
                    
                    if response.status_code == 200:
                        content = response.json()
                        return content['choices'][0]['message']['content'].strip()
                    else:
                        log.error(f"Groq Search API Error: {response.text}")
            except Exception as e:
                log.error(f"Failed to answer query via LLM: {e}")

        # Fallback Mock Answer
        return f"Based on {len(context_texts)} highly similar issues mapped in the database, here is the mock synthesized answer bridging your query to the architectural reality of the code."
    
# Module-level singleton
llm = LLMService()
