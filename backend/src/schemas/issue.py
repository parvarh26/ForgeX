from pydantic import BaseModel, ConfigDict
from typing import Optional, List

class IssueCreate(BaseModel):
    title: str
    body: str
