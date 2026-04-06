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
