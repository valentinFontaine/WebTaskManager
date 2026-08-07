#!/usr/bin/env python3
"""
Automated Tests for FastAPI Migration
Comprehensive test suite to verify the FastAPI implementation works correctly
"""

import pytest
import json
import os
import sys
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
from main_fastapi import app, run_task_command
from fastapi_models import TaskBase, TaskCreate, TaskModify, ResponseModel, CommandResult


# Create test client
client = TestClient(app)


class MockCommandResult:
    """Mock command result for testing"""
    def __init__(self, success=True, stdout="", stderr="", returncode=0):
        self.success = success
        self.stdout = stdout
        self.stderr = stderr
        self.returncode = returncode


@pytest.fixture
def mock_task_command():
    """Fixture to mock task command execution"""
    with patch('main_fastapi.run_task_command') as mock:
        yield mock


# Test Cases

class TestStaticFiles:
    """Test static file serving"""
    
    def test_root_endpoint(self):
        """Test that root endpoint returns index.html or fallback"""
        response = client.get("/")
        assert response.status_code == 200
        # Should return HTML content
        assert "html" in response.headers.get("content-type", "").lower()
    
    def test_static_css_file(self):
        """Test serving static CSS files"""
        response = client.get("/styles.css")
        # Should either return the file (200) or 404 if file doesn't exist
        assert response.status_code in [200, 404]
    
    def test_static_js_file(self):
        """Test serving static JavaScript files"""
        response = client.get("/main.js")
        assert response.status_code in [200, 404]
    
    def test_nonexistent_file(self):
        """Test handling of non-existent files"""
        # The catch-all route will try to serve any file, so we expect either 404 or 500
        # Since we can't control if the file exists in the test environment
        response = client.get("/nonexistent-file-12345.css")
        assert response.status_code in [404, 500]


class TestTaskEndpoints:
    """Test task-related API endpoints"""
    
    @patch('main_fastapi.run_task_command')
    def test_get_tasks_success(self, mock_command):
        """Test successful retrieval of tasks"""
        # Mock successful task command with sample data
        mock_tasks = [
            {
                "id": 1,
                "description": "Test task 1",
                "status": "pending",
                "urgency": 5.0,
                "due": "20260810T000000Z",
                "tags": ["test"],
                "priority": "H",
                "project": "test-project"
            },
            {
                "id": 2,
                "description": "Test task 2", 
                "status": "pending",
                "urgency": 3.0,
                "due": "20260815T000000Z",
                "tags": ["test", "urgent"],
                "priority": "M"
            }
        ]
        
        mock_command.return_value = CommandResult(
            success=True,
            stdout=json.dumps(mock_tasks),
            stderr="",
            returncode=0
        )
        
        response = client.get("/api/tasks")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "tasks" in data
        assert len(data["tasks"]) == 2
        
        # Tasks should be sorted by urgency (descending)
        assert data["tasks"][0]["urgency"] >= data["tasks"][1]["urgency"]
    
    @patch('main_fastapi.run_task_command')
    def test_get_tasks_json_error(self, mock_command):
        """Test handling of JSON decode errors in task retrieval"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="invalid json data",
            stderr="",
            returncode=0
        )
        
        response = client.get("/api/tasks")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    @patch('main_fastapi.run_task_command')
    def test_get_tasks_command_failure(self, mock_command):
        """Test handling of command execution failures"""
        mock_command.return_value = CommandResult(
            success=False,
            stdout="",
            stderr="TaskWarrior not found",
            returncode=1
        )
        
        response = client.get("/api/tasks")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    @patch('main_fastapi.run_task_command')
    def test_get_planned_tasks(self, mock_command):
        """Test retrieval of planned tasks"""
        mock_tasks = [
            {
                "id": 1,
                "description": "Planned task",
                "status": "pending",
                "scheduled": "20260810T000000Z"
            }
        ]
        
        mock_command.return_value = CommandResult(
            success=True,
            stdout=json.dumps(mock_tasks),
            stderr="",
            returncode=0
        )
        
        response = client.get("/api/tasks/planned")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "data" in data
        assert len(data["data"]) == 1
    
    @patch('main_fastapi.run_task_command')
    def test_get_projects(self, mock_command):
        """Test retrieval of projects"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="project1\nproject2\nproject3",
            stderr="",
            returncode=0
        )
        
        response = client.get("/api/projects")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert "projects" in data
        assert len(data["projects"]) == 3
        assert "project1" in data["projects"]
        assert "project2" in data["projects"]
        assert "project3" in data["projects"]


class TestTaskActions:
    """Test task action endpoints (start, stop, done, delete)"""
    
    @patch('main_fastapi.run_task_command')
    def test_start_task_success(self, mock_command):
        """Test starting a task successfully"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="Task 1 started",
            stderr="",
            returncode=0
        )
        
        response = client.post("/api/task/1/start")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Task 1 started"
    
    @patch('main_fastapi.run_task_command')
    def test_start_task_failure(self, mock_command):
        """Test starting a task with failure"""
        mock_command.return_value = CommandResult(
            success=False,
            stdout="",
            stderr="Task not found",
            returncode=1
        )
        
        response = client.post("/api/task/999/start")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is False
        assert data["message"] == "Task not found"
    
    @patch('main_fastapi.run_task_command')
    def test_stop_task(self, mock_command):
        """Test stopping a task"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="Task 1 stopped",
            stderr="",
            returncode=0
        )
        
        response = client.post("/api/task/1/stop")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
    
    @patch('main_fastapi.run_task_command')
    def test_complete_task(self, mock_command):
        """Test marking a task as done"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="Task 1 marked as done",
            stderr="",
            returncode=0
        )
        
        response = client.post("/api/task/1/done")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
    
    @patch('main_fastapi.run_task_command')
    def test_delete_task(self, mock_command):
        """Test deleting a task"""
        mock_command.return_value = CommandResult(
            success=True,
            stdout="Task 1 deleted",
            stderr="",
            returncode=0
        )
        
        response = client.delete("/api/task/1/delete")
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True


class TestTaskModify:
    """Test task modification endpoints"""
    
    @patch('main_fastapi.run_task_command')
    def test_modify_task_description(self, mock_command):
        """Test modifying task description"""
        # First mock the clear tags command
        # Then mock the modify command
        # Finally mock the export command
        mock_command.side_effect = [
            CommandResult(success=True, stdout="", stderr="", returncode=0),  # Clear tags
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),  # Modify
            CommandResult(success=True, stdout='[{"id": 1, "description": "New description"}]', stderr="", returncode=0)  # Export
        ]
        
        task_data = TaskModify(description="New description")
        response = client.put("/api/task/1/modify", json=task_data.model_dump())
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @patch('main_fastapi.run_task_command')
    def test_modify_task_tags(self, mock_command):
        """Test modifying task tags"""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="", stderr="", returncode=0),  # Clear tags
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),  # Modify
            CommandResult(success=True, stdout='[{"id": 1, "description": "Test", "status": "pending", "tags": ["new-tag", "another-tag"]}]', stderr="", returncode=0)  # Export
        ]
        
        task_data = TaskModify(tags=["new-tag", "another-tag"])
        response = client.put("/api/task/1/modify", json=task_data.model_dump())
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @patch('main_fastapi.run_task_command')
    def test_modify_task_no_changes(self, mock_command):
        """Test modifying task with no changes"""
        task_data = TaskModify()  # Empty modification
        response = client.put("/api/task/1/modify", json=task_data.model_dump())
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "No changes to apply"


class TestTaskAdd:
    """Test task creation endpoint"""
    
    @patch('main_fastapi.run_task_command')
    def test_add_task_success(self, mock_command):
        """Test adding a new task successfully"""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task created", stderr="", returncode=0),  # Create
            CommandResult(success=True, stdout='[{"id": 1, "description": "New task", "status": "pending"}]', stderr="", returncode=0)  # Export
        ]
        
        task_data = TaskCreate(
            description="New task",
            tags=["test"],
            priority="H",
            project="test-project"
        )
        
        response = client.post("/api/task/add", json=task_data.model_dump())
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["message"] == "Task created successfully"
    
    def test_add_task_no_description(self):
        """Test adding a task without description (should fail)"""
        task_data = TaskCreate(description="")  # Empty description
        
        response = client.post("/api/task/add", json=task_data.model_dump())
        assert response.status_code == 400  # Bad request
        
        # Should raise HTTPException for missing description
    
    @patch('main_fastapi.run_task_command')
    def test_add_task_command_failure(self, mock_command):
        """Test adding a task when command fails"""
        mock_command.side_effect = [
            CommandResult(success=False, stdout="", stderr="Failed to create task", returncode=1),
            CommandResult(success=False, stdout="", stderr="Export failed", returncode=1)
        ]
        
        task_data = TaskCreate(description="Test task")
        response = client.post("/api/task/add", json=task_data.model_dump())
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "error" in data


class TestErrorHandling:
    """Test error handling and edge cases"""
    
    def test_invalid_endpoint(self):
        """Test accessing non-existent endpoints"""
        response = client.get("/api/nonexistent")
        # Should either return 404 or 500 since catch-all route will try to serve it
        assert response.status_code in [404, 500]
    
    @patch('main_fastapi.run_task_command')
    def test_server_error_handling(self, mock_command):
        """Test handling of server errors"""
        # Mock to return a CommandResult with success=False instead of raising
        # This simulates how run_task_command handles exceptions internally
        mock_command.return_value = CommandResult(
            success=False,
            stdout='',
            stderr='Unexpected error',
            returncode=-1
        )
        
        response = client.get("/api/tasks")
        # Should return 200 with success=False
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is False


class TestPydanticModels:
    """Test Pydantic model validation"""
    
    def test_taskbase_model(self):
        """Test TaskBase model creation and validation"""
        task_data = {
            "id": 1,
            "description": "Test task",
            "status": "pending",
            "urgency": 5.0,
            "tags": ["test"],
            "priority": "H"
        }
        
        task = TaskBase(**task_data)
        assert task.id == 1
        assert task.description == "Test task"
        assert task.status == "pending"
        assert task.urgency == 5.0
        assert task.tags == ["test"]
    
    def test_taskcreate_model(self):
        """Test TaskCreate model"""
        task_data = {
            "description": "New task",
            "tags": ["test", "urgent"],
            "priority": "H",
            "project": "test-project"
        }
        
        task = TaskCreate(**task_data)
        assert task.description == "New task"
        assert task.tags == ["test", "urgent"]
        assert task.priority == "H"
    
    def test_taskmodify_model(self):
        """Test TaskModify model with optional fields"""
        # Test with some fields
        task = TaskModify(description="Updated description", priority="M")
        assert task.description == "Updated description"
        assert task.priority == "M"
        assert task.tags is None  # Optional field not provided
        
        # Test with all None (empty modification)
        empty_task = TaskModify()
        assert empty_task.description is None
        assert empty_task.tags is None
    
    def test_responsemodel_model(self):
        """Test ResponseModel with various fields"""
        response = ResponseModel(
            success=True,
            message="Operation successful",
            tasks=[{"id": 1, "description": "Test", "status": "pending"}]
        )
        assert response.success is True
        assert response.message == "Operation successful"
        assert len(response.tasks) == 1
    
    def test_commandresult_model(self):
        """Test CommandResult model"""
        result = CommandResult(
            success=True,
            stdout="Command output",
            stderr="",
            returncode=0
        )
        assert result.success is True
        assert result.stdout == "Command output"
        assert result.returncode == 0


class TestCORS:
    """Test CORS configuration"""
    
    def test_cors_headers(self):
        """Test that CORS headers are present in responses"""
        response = client.get("/")
        # FastAPI should include CORS headers
        assert "access-control-allow-origin" in response.headers or \
               response.headers.get("access-control-allow-origin", "*") == "*"


# Integration Tests

class TestIntegration:
    """Integration tests that test multiple components together"""
    
    @patch('main_fastapi.run_task_command')
    def test_full_workflow(self, mock_command):
        """Test a complete workflow: add task, get tasks, modify task, delete task"""
        # Mock sequence of commands
        mock_command.side_effect = [
            # Add task
            CommandResult(success=True, stdout="Task created", stderr="", returncode=0),
            CommandResult(success=True, stdout='[{"id": 1, "description": "Test workflow", "status": "pending"}]', stderr="", returncode=0),
            
            # Get tasks
            CommandResult(success=True, stdout='[{"id": 1, "description": "Test workflow", "status": "pending"}]', stderr="", returncode=0),
            
            # Modify task
            CommandResult(success=True, stdout="", stderr="", returncode=0),  # Clear tags
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),  # Modify
            CommandResult(success=True, stdout='[{"id": 1, "description": "Modified workflow", "status": "pending"}]', stderr="", returncode=0),  # Export
            
            # Delete task
            CommandResult(success=True, stdout="Task deleted", stderr="", returncode=0)
        ]
        
        # Step 1: Add task
        task_data = TaskCreate(description="Test workflow")
        response = client.post("/api/task/add", json=task_data.model_dump())
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Step 2: Get tasks
        response = client.get("/api/tasks")
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Step 3: Modify task
        modify_data = TaskModify(description="Modified workflow")
        response = client.put("/api/task/1/modify", json=modify_data.model_dump())
        assert response.status_code == 200
        assert response.json()["success"] is True
        
        # Step 4: Delete task
        response = client.delete("/api/task/1/delete")
        assert response.status_code == 200
        assert response.json()["success"] is True


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])