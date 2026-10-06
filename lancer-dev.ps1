# Lance le serveur de DEV sur http://localhost:8000, base jetable taskwarrior-dev.
# Les variables ne valent que pour ce processus : rien n'est pose globalement.

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Remove-Item Env:TASKDATA -ErrorAction SilentlyContinue      # l'emporterait sur le taskrc
$env:TASKRC = 'C:/Users/irpaui/taskwarrior-dev/taskrc'
$env:WTM_PORT = '8000'

$host.UI.RawUI.WindowTitle = 'WebTaskManager DEV - http://localhost:8000'
& (Join-Path $PSScriptRoot 'venv\Scripts\python.exe') main_fastapi.py
