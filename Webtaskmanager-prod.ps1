# Lance le serveur de PROD du PC sur http://localhost:1875 et ouvre le navigateur.
#
# Sert toujours le worktree de prod (..\WebTaskManager-prod), quelle que soit la
# copie du script lancee. Raccourci bureau :
#   powershell.exe -ExecutionPolicy Bypass -File "<chemin>\WebTaskManager-prod\Webtaskmanager-prod.ps1"
#
# Les variables ne valent que pour ce processus : rien n'est pose globalement.

$ErrorActionPreference = 'Stop'
$port = 1875
$url = "http://localhost:$port"

function Test-Serveur {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

# Deja lance (second clic sur le raccourci) : on ouvre seulement la page.
if (Test-Serveur) {
    Start-Process $url
    exit 0
}

# Toujours le worktree de prod, ou que soit la copie du script lancee (le
# raccourci peut viser celle du dossier de dev : sans cela, le verrou refuse).
$dossierProd = Join-Path (Split-Path $PSScriptRoot -Parent) 'WebTaskManager-prod'
Set-Location $dossierProd
Remove-Item Env:TASKDATA -ErrorAction SilentlyContinue      # l'emporterait sur le taskrc
Remove-Item Env:DEVELOPER_MODE -ErrorAction SilentlyContinue
$env:TASKRC = 'C:/Users/irpaui/taskwarrior-prod/taskrc'
$env:WTM_PORT = "$port"

$host.UI.RawUI.WindowTitle = "WebTaskManager PROD - $url"
$python = Join-Path $dossierProd 'venv\Scripts\python.exe'
$serveur = Start-Process $python -ArgumentList 'main_fastapi.py' -NoNewWindow -PassThru
$null = $serveur.Handle   # sans lecture du Handle, ExitCode reste vide une fois le processus fini

for ($i = 0; $i -lt 30 -and -not $serveur.HasExited; $i++) {
    if (Test-Serveur) { Start-Process $url; break }
    Start-Sleep -Seconds 1
}

$serveur.WaitForExit()
if ($serveur.ExitCode -ne 0) {
    Write-Host "Le serveur s'est arrete (code $($serveur.ExitCode))." -ForegroundColor Red
    Read-Host 'Entree pour fermer'
}
