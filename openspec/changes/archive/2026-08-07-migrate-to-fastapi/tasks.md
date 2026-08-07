# Migration Tasks

## Task List

### Phase 1: Project Setup and Dependencies

#### 1.1 Update requirements.txt
- [ ] Remove `flask` and `flask-cors` from requirements.txt
- [ ] Add `fastapi>=0.104.0` to requirements.txt
- [ ] Add `uvicorn>=0.24.0` to requirements.txt
- [ ] Add `pydantic>=2.5.0` to requirements.txt

**Estimated Time:** 15 minutes
**Priority:** High
**Dependencies:** None

#### 1.2 Install new dependencies
- [ ] Run `pip install -r requirements.txt` in the virtual environment
- [ ] Verify all packages install successfully

**Estimated Time:** 10 minutes
**Priority:** High
**Dependencies:** 1.1

### Phase 2: Create Pydantic Models

#### 2.1 Create models.py with data schemas
- [ ] Create TaskBase model for task data structure
- [ ] Create TaskCreate model for new task creation
- [ ] Create TaskModify model for task modifications
- [ ] Create ResponseModel for standardized API responses
- [ ] Add any additional helper models as needed

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 1.2

### Phase 3: FastAPI Application Setup

#### 3.1 Create new main.py application
- [ ] Import FastAPI and create app instance
- [ ] Configure CORS middleware
- [ ] Set up static files serving
- [ ] Import and mount all route handlers

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 2.1

#### 3.2 Convert utility functions
- [ ] Move `run_task_command()` from app.py to main.py
- [ ] Move `log_command()` from app.py to main.py
- [ ] Update imports as needed

**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** 3.1

### Phase 4: Route Conversion

#### 4.1 Static file routes
- [ ] Convert `/` index route to FastAPI
- [ ] Convert `/<path:filename>` static files route to FastAPI

**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** 3.1

#### 4.2 Task listing routes
- [ ] Convert `/api/tasks` GET endpoint
- [ ] Convert `/api/tasks/planned` GET endpoint
- [ ] Convert `/api/projects` GET endpoint

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 3.2

#### 4.3 Task action routes
- [ ] Convert `/api/task/<task_id>/start` POST endpoint
- [ ] Convert `/api/task/<task_id>/stop` POST endpoint
- [ ] Convert `/api/task/<task_id>/done` POST endpoint
- [ ] Convert `/api/task/<task_id>/delete` DELETE endpoint

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 4.2

#### 4.4 Task modification routes
- [ ] Convert `/api/task/<task_id>/modify` PUT endpoint
- [ ] Convert `/api/task/add` POST endpoint

**Estimated Time:** 1.5 hours
**Priority:** High
**Dependencies:** 4.3

### Phase 5: Configuration and Testing

#### 5.1 Update entry point
- [ ] Modify app.py to import and run the FastAPI app with uvicorn
- [ ] Keep backward compatibility with `python app.py` command

**Estimated Time:** 30 minutes
**Priority:** Medium
**Dependencies:** 4.4

#### 5.2 Test all endpoints
- [ ] Test static file serving (index.html, CSS, JS)
- [ ] Test GET /api/tasks endpoint
- [ ] Test GET /api/tasks/planned endpoint
- [ ] Test GET /api/projects endpoint
- [ ] Test POST /api/task/{id}/start endpoint
- [ ] Test POST /api/task/{id}/stop endpoint
- [ ] Test POST /api/task/{id}/done endpoint
- [ ] Test DELETE /api/task/{id}/delete endpoint
- [ ] Test PUT /api/task/{id}/modify endpoint
- [ ] Test POST /api/task/add endpoint

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 5.1

#### 5.3 Frontend compatibility testing
- [ ] Load the web interface in a browser
- [ ] Test all existing functionality
- [ ] Fix any API response format issues
- [ ] Verify no JavaScript errors in console

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 5.2

### Phase 6: Cleanup and Documentation

#### 6.1 Remove old Flask code
- [ ] Archive or remove old Flask app.py (after successful migration)
- [ ] Clean up any temporary files

**Estimated Time:** 15 minutes
**Priority:** Low
**Dependencies:** 5.3

#### 6.2 Update documentation
- [ ] Update README.md with new dependencies and run instructions
- [ ] Add FastAPI documentation URL (/docs, /redoc)

**Estimated Time:** 30 minutes
**Priority:** Low
**Dependencies:** 5.3

## Total Estimated Time
- **Minimum:** 8 hours
- **Realistic:** 10-12 hours
- **With testing/debugging:** 12-15 hours

## Success Criteria
- [ ] All existing API endpoints work with same functionality
- [ ] Frontend JavaScript works without modification
- [ ] All tests pass (if existing tests are available)
- [ ] No breaking changes for existing users
- [ ] FastAPI documentation available at `/docs`

## Rollback Plan
1. Keep the old app.py file until migration is confirmed successful
2. Maintain git history so we can revert if needed
3. Document any breaking changes and migration steps for users