$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot 'backend'
$FrontendDir = Join-Path $ProjectRoot 'frontend'
$EnvFile = Join-Path $ProjectRoot '.env'
$VenvDir = Join-Path $BackendDir '.venv'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'

Write-Host ''
Write-Host '  VentureLens AI - local development launcher' -ForegroundColor Cyan
Write-Host '  -------------------------------------------' -ForegroundColor DarkGray

if (-not (Test-Path $EnvFile)) {
    Copy-Item (Join-Path $ProjectRoot '.env.example') $EnvFile
    Write-Host 'Created .env from .env.example.' -ForegroundColor Green
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'Node.js/npm was not found. Install Node.js 20+ and reopen PowerShell.'
}
$NodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt 20) {
    throw "Node.js 20 or newer is required. Detected Node.js major version $NodeMajor."
}

if (-not (Test-Path $VenvPython)) {
    Write-Host 'Creating backend Python environment...' -ForegroundColor Yellow
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv $VenvDir
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv $VenvDir
    } else {
        throw 'Python was not found. Install Python 3.11+ and reopen PowerShell.'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the Python virtual environment.' }
}

Write-Host 'Installing/verifying backend dependencies...' -ForegroundColor Yellow
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw 'Could not upgrade pip.' }
& $VenvPython -m pip install -r (Join-Path $BackendDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }

if (-not (Test-Path (Join-Path $FrontendDir 'node_modules'))) {
    Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
    Push-Location $FrontendDir
    try { npm install; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' } }
    finally { Pop-Location }
}

$BackendCommand = "Set-Location -LiteralPath '$BackendDir'; & '$VenvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"
$FrontendCommand = "Set-Location -LiteralPath '$FrontendDir'; npm run dev"

Write-Host 'Starting FastAPI backend in a new PowerShell window...' -ForegroundColor Green
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $BackendCommand)
Start-Sleep -Seconds 2

Write-Host 'Starting Vite frontend in a new PowerShell window...' -ForegroundColor Green
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $FrontendCommand)

Start-Sleep -Seconds 3
Start-Process 'http://127.0.0.1:5173'
Write-Host ''
Write-Host 'VentureLens is starting.' -ForegroundColor Green
Write-Host 'Dashboard: http://127.0.0.1:5173'
Write-Host 'API docs:  http://127.0.0.1:8000/docs'
Write-Host ''
Write-Host 'Keep the two server windows open while using the dashboard.' -ForegroundColor Yellow
