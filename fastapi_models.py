# Pydantic Models for TaskWarrior Web UI
# Data validation models for FastAPI endpoints

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class TaskBase(BaseModel):
    """Base model for TaskWarrior task data"""
    id: Optional[int] = None
    description: str
    status: str
    urgency: Optional[float] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    tags: Optional[List[str]] = []
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    """Model for creating new tasks"""
    description: str
    tags: Optional[List[str]] = []
    due: Optional[str] = None
    scheduled: Optional[str] = None
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

    class Config:
        from_attributes = True


class TaskModify(BaseModel):
    """Model for modifying existing tasks"""
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

    class Config:
        from_attributes = True


class ResponseModel(BaseModel):
    """Standardized API response model"""
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    data: Optional[Any] = None
    tasks: Optional[List[TaskBase]] = None
    task: Optional[TaskBase] = None
    projects: Optional[List[str]] = None

    class Config:
        from_attributes = True


class CommandResult(BaseModel):
    """Model for TaskWarrior command execution results"""
    success: bool
    stdout: str
    stderr: str
    returncode: int

    class Config:
        from_attributes = True