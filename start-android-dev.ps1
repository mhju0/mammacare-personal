$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$python = Join-Path $backend "venv\Scripts\python.exe"
$adb = Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe"

if (-not (Test-Path $python)) {
    throw "Backend virtual environment not found: $python"
}

if (-not (Test-Path $adb)) {
    throw "Android adb not found: $adb"
}

$dbClient = [System.Net.Sockets.TcpClient]::new()
try {
    $dbConnect = $dbClient.ConnectAsync("127.0.0.1", 5432)
    if (-not $dbConnect.Wait(3000) -or -not $dbClient.Connected) {
        throw "PostgreSQL or the SSH database tunnel is not reachable on localhost:5432."
    }
} finally {
    $dbClient.Dispose()
}

$devices = & $adb devices
if (-not ($devices -match "\tdevice$")) {
    throw "No authorized Android device is connected."
}

& $adb reverse tcp:8000 tcp:8000
if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure adb reverse for port 8000."
}

Write-Host "Android port forwarding: localhost:8000 -> PC localhost:8000" -ForegroundColor Green
Write-Host "Starting Mammacare backend. Keep this terminal open; press Ctrl+C to stop." -ForegroundColor Green

Push-Location $backend
try {
    & $python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
} finally {
    Pop-Location
}
