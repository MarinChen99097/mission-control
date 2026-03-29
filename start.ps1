## Mission Control - Local Launcher
$env:NEXT_PUBLIC_GATEWAY_OPTIONAL = "true"
$env:PORT = "3000"

Set-Location $PSScriptRoot

Write-Host "Starting Mission Control on http://localhost:3000 ..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"
npx next start --hostname 0.0.0.0 --port 3000
