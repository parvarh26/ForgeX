from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class IssueCreate(BaseModel):
    title: str
    body: str
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "title": "Timeout on checkout page",
                "body": "When users try to pay, the gateway times out returning 504."
            }
        }
    )

class IssueResponse(BaseModel):
    id: int
    title: str
    priority_score: float
    duplicate_count: int
    similar_issues: List[int]

class ClusterInsightResponse(BaseModel):
    cluster_id: int
    issue_count: int
    insight: str
    urgency: str
    issues: List[dict]
