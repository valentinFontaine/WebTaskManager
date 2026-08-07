# Migration Design: Flask to FastAPI

## Architecture Overview

The migration maintains the same overall architecture but upgrades the web framework layer:

```
TaskWarrior CLI (subprocess)
    ↓
FastAPI Application (new)
    ↓
Static Files + API Endpoints
    ↓
Frontend JavaScript (unchanged)
```

## Component Changes

### 1. Dependencies Update

**Remove:**
- `flask`
- `flask-cors`

**Add:**
- `fastapi`
- `uvicorn` (ASGI server)
- `pydantic` (data validation)

### 2. Application Structure

```python
# New structure
main.py           # FastAPI application entry point
models.py         # Pydantic models for request/response validation
routes/           # API route handlers (optional, for larger apps)
config.py         # Configuration (unchanged)
```

### 3. API Endpoint Mapping

All existing Flask routes will be converted to FastAPI routes:

| Flask Route | FastAPI Route | Method |
|-------------|---------------|---------|
| `/` | `/` | GET |
| `/<path:filename>` | `/{filename:path}` | GET |
| `/api/tasks` | `/api/tasks` | GET |
| `/api/tasks/planned` | `/api/tasks/planned` | GET |
| `/api/projects` | `/api/projects` | GET |
| `/api/task/<task_id>/start` | `/api/task/{task_id}/start` | POST |
| `/api/task/<task_id>/stop` | `/api/task/{task_id}/stop` | POST |
| `/api/task/<task_id>/done` | `/api/task/{task_id}/done` | POST |
| `/api/task/<task_id>/delete` | `/api/task/{task_id}/delete` | DELETE |
| `/api/task/<task_id>/modify` | `/api/task/{task_id}/modify` | PUT |
| `/api/task/add` | `/api/task/add` | POST |

### 4. Data Models (Pydantic)

```python
# models.py
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class TaskBase(BaseModel):
    id: int
    description: str
    status: str
    urgency: Optional[float] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    tags: Optional[List[str]] = []
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

class TaskCreate(BaseModel):
    description: str
    tags: Optional[List[str]] = []
    due: Optional[str] = None
    scheduled: Optional[str] = None
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

class TaskModify(BaseModel):
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    due: Optional[str] = None
    scheduled: Optional[str] = None
    priority: Optional[str] = None
    project: Optional[str] = None
    estTime: Optional[str] = None

class ResponseModel(BaseModel):
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None
    data: Optional[Any] = None
    tasks: Optional[List[TaskBase]] = None
    task: Optional[TaskBase] = None
    projects: Optional[List[str]] = None
```

### 5. Error Handling

Centralized error handling using FastAPI's exception handlers:
- HTTPException for standard HTTP errors
- Custom exceptions for business logic errors

### 6. CORS Configuration

FastAPI uses CORS middleware similar to Flask-CORS:
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)
```

### 7. Static Files

FastAPI's StaticFiles handles static file serving:
```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory=".", html=True), name="static")
```

## Migration Strategy

### Phase 1: Setup (1-2 hours)
- Install FastAPI dependencies
- Create new models.py with Pydantic models
- Update requirements.txt

### Phase 2: Core Application (2-3 hours)
- Create new main.py with FastAPI app setup
- Implement CORS middleware
- Set up static file serving

### Phase 3: Route Conversion (3-4 hours)
- Convert each Flask route to FastAPI
- Add proper type hints
- Implement request/response validation

### Phase 4: Testing (2-3 hours)
- Test all API endpoints
- Verify frontend compatibility
- Fix any response format issues

## Risk Assessment

**Low Risk:**
- Static file serving
- Basic API endpoints
- CORS configuration

**Medium Risk:**
- Request/response format changes
- Error handling differences

**High Risk:**
- Task command execution logic (must remain unchanged)
- Subprocess handling compatibility