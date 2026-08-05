#!/usr/bin/env python3
"""
TaskWarrior Web UI - FastAPI Backend Server Entry Point
A modern FastAPI server to interface with TaskWarrior commands
"""

from main_fastapi import app
import uvicorn

if __name__ == '__main__':
    # Check if TaskWarrior is installed
    from main_fastapi import run_task_command
    check_result = run_task_command('task version')
    if not check_result.success:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result.stdout.split('\n')[0])
    
    print("Starting TaskWarrior Web UI with FastAPI...")
    print("Access the interface at: http://localhost:8000")
    print("FastAPI docs available at: http://localhost:8000/docs")
    uvicorn.run(app, host='0.0.0.0', port=8000)