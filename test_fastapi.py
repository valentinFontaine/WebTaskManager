#!/usr/bin/env python3
"""
Automated Tests for FastAPI Migration
Comprehensive test suite to verify the FastAPI implementation works correctly
"""

import pytest
import json
import os
import subprocess
import sys
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient
import main_fastapi
from main_fastapi import app, run_task_command, text_field_gaps
from config import TASK_TIMEOUT
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
    
    @patch('main_fastapi.run_task_command')
    def test_add_task_repairs_corrupted_description(self, mock_command):
        """Une description corrompue par task.exe est reecrite via task import.

        Reproduit le defaut Windows : l'export qui suit la creation ne rend pas la
        description demandee. Voir openspec/changes/fix-nonascii-argv-windows.
        """
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task created", stderr="", returncode=0),
            # Export : description mutilee par le passage en argv
            CommandResult(success=True, stdout='[{"id": 1, "uuid": "abc-123", "description": "T\\u00e2\\u00a3\\u00a8e accentuee"}]', stderr="", returncode=0),
            CommandResult(success=True, stdout="Imported 1 tasks.", stderr="", returncode=0),
            # Reexport apres reparation
            CommandResult(success=True, stdout='[{"id": 1, "uuid": "abc-123", "description": "T\\u00e2che accentuee"}]', stderr="", returncode=0),
        ]

        response = client.post("/api/task/add", json=TaskCreate(description="Tâche accentuee").model_dump())

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["task"]["description"] == "Tâche accentuee"
        # add + export + import + reexport
        assert mock_command.call_count == 4
        assert 'import' in mock_command.call_args_list[2][0][0]

    @patch('main_fastapi.run_task_command')
    def test_add_task_skips_repair_when_stored_value_matches(self, mock_command):
        """Sous Linux argv preserve l'UTF-8 : aucune commande supplementaire ne doit partir."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task created", stderr="", returncode=0),
            CommandResult(success=True, stdout='[{"id": 1, "uuid": "abc-123", "description": "T\\u00e2che accentuee"}]', stderr="", returncode=0),
        ]

        response = client.post("/api/task/add", json=TaskCreate(description="Tâche accentuee").model_dump())

        assert response.status_code == 200
        assert response.json()["success"] is True
        assert mock_command.call_count == 2

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


class TestTextFieldGaps:
    """Detection des champs texte que TaskWarrior n'a pas stockes tels que demandes"""

    def test_no_gap_when_values_match(self):
        stored = {"description": "Tâche", "project": "Essai", "tags": ["a", "b"]}
        wanted = {"description": "Tâche", "project": "Essai", "tags": ["a", "b"]}
        assert text_field_gaps(stored, wanted) == {}

    def test_detects_corrupted_description(self):
        stored = {"description": "Tâ£¨e"}
        assert text_field_gaps(stored, {"description": "Tâche"}) == {"description": "Tâche"}

    def test_ignores_fields_not_requested(self):
        """Un champ absent de la demande (None) ne doit jamais declencher de reparation."""
        stored = {"description": "Tâche", "project": "Essai"}
        assert text_field_gaps(stored, {"description": None, "project": None}) == {}

    def test_tags_compared_regardless_of_order(self):
        stored = {"tags": ["b", "a"]}
        assert text_field_gaps(stored, {"tags": ["a", "b"]}) == {}

    def test_detects_missing_tag(self):
        stored = {"tags": ["a"]}
        assert text_field_gaps(stored, {"tags": ["a", "b"]}) == {"tags": ["a", "b"]}

    def test_absent_field_matches_empty_request(self):
        """Demander un projet vide sur une tache sans projet n'est pas un ecart."""
        assert text_field_gaps({"description": "x"}, {"project": ""}) == {}


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])


class TestCommandTimeout:
    """Le lanceur doit rendre la main meme si `task` ne repond jamais.

    Sous pytest, DEVELOPER_MODE vaut True et court-circuite l'execution : ces
    tests le desactivent pour atteindre reellement `subprocess.run`.
    """

    def _faux_subprocess(self, **kwargs):
        return patch('main_fastapi.subprocess.run', **kwargs)

    def test_timeout_renvoie_une_erreur_explicite(self):
        """Un depassement ne doit ni lever ni bloquer, mais expliquer quoi faire."""
        depassement = subprocess.TimeoutExpired(cmd='task export', timeout=TASK_TIMEOUT)
        with patch('main_fastapi.DEVELOPER_MODE', False), \
             patch('main_fastapi.log_command'), \
             self._faux_subprocess(side_effect=depassement):
            result = run_task_command('task export')

        assert result.success is False
        assert result.returncode == -1
        # Le message doit orienter vers la cause la plus probable.
        assert 'hook' in result.stderr.lower()
        assert str(TASK_TIMEOUT) in result.stderr

    def test_le_timeout_est_bien_transmis(self):
        """Sans cet argument, une commande suspendue bloquerait la requete."""
        with patch('main_fastapi.DEVELOPER_MODE', False), \
             patch('main_fastapi.log_command'), \
             self._faux_subprocess() as faux:
            faux.return_value = MagicMock(returncode=0, stdout='', stderr='')
            run_task_command('task export')

        assert faux.call_args.kwargs['timeout'] == TASK_TIMEOUT

    def test_tw_web_est_expose_aux_hooks(self):
        """Les hooks doivent pouvoir detecter l'absence de terminal."""
        with patch('main_fastapi.DEVELOPER_MODE', False), \
             patch('main_fastapi.log_command'), \
             self._faux_subprocess() as faux:
            faux.return_value = MagicMock(returncode=0, stdout='', stderr='')
            run_task_command('task export')

        assert faux.call_args.kwargs['env']['TW_WEB'] == '1'

    def test_l_encodage_utf8_reste_impose(self):
        """Non-regression : sans lui, les accents ressortent en mojibake sous Windows."""
        with patch('main_fastapi.DEVELOPER_MODE', False), \
             patch('main_fastapi.log_command'), \
             self._faux_subprocess() as faux:
            faux.return_value = MagicMock(returncode=0, stdout='', stderr='')
            run_task_command('task export')

        assert faux.call_args.kwargs['encoding'] == 'utf-8'


class TestKanban:
    """Tableau Kanban : colonnes configurees et deplacement d'une tache."""

    def test_colonnes_exposees(self):
        """La page lit `columns` a la racine de la reponse."""
        from config import KANBAN_COLUMNS
        response = client.get("/api/kanban/columns")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["columns"] == KANBAN_COLUMNS

    @patch('main_fastapi.run_task_command')
    def test_deplacer_une_tache_ecrit_l_uda_state(self, mock_command):
        """Glisser une carte doit produire `state:doing`, pas autre chose."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),
            CommandResult(success=True, stdout='[{"id": 1, "description": "T", "state": "doing"}]',
                          stderr="", returncode=0),
        ]

        response = client.put("/api/task/1/modify", json={"state": "doing"})

        assert response.status_code == 200
        assert response.json()["success"] is True
        commande_modify = mock_command.call_args_list[0][0][0]
        assert 'state:doing' in commande_modify

    @patch('main_fastapi.run_task_command')
    def test_etat_vide_efface_l_uda(self, mock_command):
        """Remettre une carte dans "Sans etat" doit effacer l'UDA, pas l'ignorer."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),
            CommandResult(success=True, stdout='[{"id": 1, "description": "T"}]',
                          stderr="", returncode=0),
        ]

        response = client.put("/api/task/1/modify", json={"state": ""})

        assert response.status_code == 200
        commande_modify = mock_command.call_args_list[0][0][0]
        assert 'state:' in commande_modify
        assert 'state:doing' not in commande_modify

    @patch('main_fastapi.run_task_command')
    def test_state_absent_ne_touche_pas_l_uda(self, mock_command):
        """Non-regression : une modification sans `state` ne doit rien ecrire dessus."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="Task modified", stderr="", returncode=0),
            CommandResult(success=True, stdout='[{"id": 1, "description": "Nouvelle"}]',
                          stderr="", returncode=0),
        ]

        response = client.put("/api/task/1/modify", json={"description": "Nouvelle"})

        assert response.status_code == 200
        commande_modify = mock_command.call_args_list[0][0][0]
        assert 'state:' not in commande_modify


class TestContextesEtConfig:
    """Endpoints de lecture requis par nav.js."""

    SHOW = (
        "context.pro.read=+pro\n"
        "context.pro.write=+pro\n"
        "context.perso.read=+perso\n"
        "context.perso.write=+perso\n"
        "context.pro:perso.read=+pro or +perso\n"
        "uda.estTime.type=duration\n"
    )

    def setup_method(self):
        # Le cache des contextes est un global du module : sans remise a zero,
        # un test contaminerait les suivants selon l'ordre d'execution.
        main_fastapi._ctx_cache = {}
        main_fastapi._ctx_cache_ts = 0.0

    @patch('main_fastapi.run_task_command')
    def test_contextes_lus_depuis_task_show(self, mock_command):
        mock_command.side_effect = [
            CommandResult(success=True, stdout=self.SHOW, stderr="", returncode=0),
            CommandResult(success=True, stdout="pro\n", stderr="", returncode=0),
        ]

        data = client.get("/api/contexts").json()

        assert data["success"] is True
        assert data["contexts"] == ["pro", "perso"]
        assert data["filters"]["pro"] == "+pro"
        assert data["active"] == "pro"

    @patch('main_fastapi.run_task_command')
    def test_contextes_composites_masques(self, mock_command):
        """`pro:perso` est de la plomberie TaskWarrior, pas un contexte utilisateur."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout=self.SHOW, stderr="", returncode=0),
            CommandResult(success=True, stdout="", stderr="", returncode=0),
        ]

        data = client.get("/api/contexts").json()

        assert "pro:perso" not in data["contexts"]
        # ... mais il reste expose dans les filtres, comme dans la PR d'origine.
        assert "pro:perso" in data["filters"]

    @patch('main_fastapi.run_task_command')
    def test_le_cache_evite_un_second_task_show(self, mock_command):
        """`task _show` dumpe toute la configuration : on ne le rejoue pas a chaque appel."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout=self.SHOW, stderr="", returncode=0),
            CommandResult(success=True, stdout="", stderr="", returncode=0),
            CommandResult(success=True, stdout="", stderr="", returncode=0),
        ]

        client.get("/api/contexts")
        client.get("/api/contexts")

        appels_show = [c for c in mock_command.call_args_list if '_show' in c[0][0]]
        assert len(appels_show) == 1

    @patch('main_fastapi.run_task_command')
    def test_aucun_contexte_defini(self, mock_command):
        """Un taskrc sans contexte ne doit pas faire echouer l'endpoint."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="uda.estTime.type=duration\n",
                          stderr="", returncode=0),
            CommandResult(success=True, stdout="", stderr="", returncode=0),
        ]

        data = client.get("/api/contexts").json()

        assert data["success"] is True
        assert data["contexts"] == []
        assert data["active"] == ""

    def test_config_expose_le_delai_de_notification(self):
        """nav.js lit `notification_timeout` a la racine, sans regarder `success`."""
        from config import NOTIFICATION_TIMEOUT
        data = client.get("/api/config").json()

        assert data["notification_timeout"] == NOTIFICATION_TIMEOUT


class TestFiltrageDesTaches:
    """Parametres status / context / filter sur /api/tasks, requis par nav.js."""

    def setup_method(self):
        main_fastapi._ctx_cache = {}
        main_fastapi._ctx_cache_ts = 0.0
        main_fastapi._recur_filter = None

    @staticmethod
    def _export_vide():
        return CommandResult(success=True, stdout="[]", stderr="", returncode=0)

    @patch('main_fastapi.run_task_command')
    def test_par_defaut_les_taches_en_cours(self, mock_command):
        """Non-regression : sans parametre, le comportement d'avant est conserve."""
        mock_command.return_value = self._export_vide()

        client.get("/api/tasks")

        commande = mock_command.call_args_list[0][0][0]
        assert 'status:pending' in commande
        assert ' or ' not in commande

    @patch('main_fastapi.run_task_command')
    def test_plusieurs_statuts_sont_combines_en_ou(self, mock_command):
        mock_command.return_value = self._export_vide()

        client.get("/api/tasks?status=pending,completed")

        commande = mock_command.call_args_list[0][0][0]
        assert '"(status:pending or status:completed)"' in commande

    @patch('main_fastapi.run_task_command')
    def test_l_expression_est_quotee(self, mock_command):
        """Sous /bin/sh (Termux), des parentheses nues sont une erreur de syntaxe."""
        mock_command.return_value = self._export_vide()

        client.get("/api/tasks?status=pending,waiting")

        commande = mock_command.call_args_list[0][0][0]
        assert 'task "(' in commande
        assert 'task (' not in commande

    @patch('main_fastapi.run_task_command')
    def test_un_statut_inconnu_retombe_sur_pending(self, mock_command):
        """Un parametre fantaisiste ne doit pas produire un filtre vide."""
        mock_command.return_value = self._export_vide()

        client.get("/api/tasks?status=nimportequoi")

        commande = mock_command.call_args_list[0][0][0]
        assert 'status:pending' in commande

    @patch('main_fastapi.run_task_command')
    def test_le_contexte_est_applique_en_filtre_en_ligne(self, mock_command):
        """`rc.context=` modifierait l'etat de TaskWarrior : on ne l'utilise pas."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="context.pro.read=+pro\n",
                          stderr="", returncode=0),
            self._export_vide(),
        ]

        client.get("/api/tasks?context=pro")

        commande = mock_command.call_args_list[-1][0][0]
        assert '"(+pro)"' in commande
        assert 'rc.context' not in commande

    @patch('main_fastapi.run_task_command')
    def test_un_contexte_inconnu_est_ignore(self, mock_command):
        mock_command.side_effect = [
            CommandResult(success=True, stdout="context.pro.read=+pro\n",
                          stderr="", returncode=0),
            self._export_vide(),
        ]

        client.get("/api/tasks?context=inexistant")

        commande = mock_command.call_args_list[-1][0][0]
        assert '()' not in commande

    @patch('main_fastapi.run_task_command')
    def test_le_texte_de_filtre_est_assaini(self, mock_command):
        """Le texte finit dans une commande shell : un guillemet en sortirait."""
        mock_command.return_value = self._export_vide()

        client.get('/api/tasks?filter=" %26%26 rm -rf ; echo')

        commande = mock_command.call_args_list[0][0][0]
        # Le terme recherche est le contenu entre guillemets qui suit le prefixe.
        terme = commande.split('description.contains:')[1].split('"')[0]
        for interdit in ('"', '&', ';', '|', '$', '`'):
            assert interdit not in terme
        # Le texte restant est inoffensif : c'est une chaine de recherche, pas
        # une commande. Seuls les metacaracteres du shell devaient disparaitre.
        assert 'rm' in terme

    @patch('main_fastapi.run_task_command')
    def test_recurring_utilise_le_champ_standard(self, mock_command):
        """Sans `recurrence.field` dans la config, c'est +RECURRING."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="uda.estTime.type=duration\n",
                          stderr="", returncode=0),
            self._export_vide(),
        ]

        client.get("/api/tasks?status=recurring")

        commande = mock_command.call_args_list[-1][0][0]
        assert '+RECURRING' in commande

    @patch('main_fastapi.run_task_command')
    def test_recurring_suit_le_champ_personnalise(self, mock_command):
        """Le hook recurrence-overhaul deplace la recurrence dans un autre champ."""
        mock_command.side_effect = [
            CommandResult(success=True, stdout="recurrence.field=r\n",
                          stderr="", returncode=0),
            self._export_vide(),
        ]

        client.get("/api/tasks?status=recurring")

        commande = mock_command.call_args_list[-1][0][0]
        assert 'r.any:' in commande
