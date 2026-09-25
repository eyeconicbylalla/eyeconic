#Requires -Version 5.1
<#
.SYNOPSIS
  Starts the full Eyeconic local dev stack: App backend (:3000),
  website server (:5000) and website client (:5173).

.DESCRIPTION
  The integrated /dashboard serves all quiz/analytics data through the
  website's /api/app/* proxy, which forwards to the App backend -- the
  single source of truth. If the App backend is not running, every
  dashboard card fails with 503 "Eyeconic is taking a moment to respond."
  This script starts all three services, each in its own window.

  A port being BUSY is not proof that OUR service owns it: another project
  on this machine may hold the port (a second Vite app on :5173, another
  node server on :3000). Each service is therefore verified by an HTTP
  signature probe, not by port occupancy alone:
    app-backend    GET /api/health            -> 200, body contains "eyeconic-api"
    website-server GET /api/app-auth/session  -> 200, body contains "user"
    website-client GET /                      -> 200, body contains "Eyeconic"
  A port held by a foreign process is reported loudly and the script exits
  non-zero, instead of silently skipping the service (old behavior) or
  letting Vite silently take the next free port.

  NOTE: keep this file ASCII-only (no em-dashes/arrows/curly quotes).
  Windows PowerShell 5.1 reads BOM-less files as ANSI/CP1252, where
  UTF-8 punctuation bytes decode as curly quotes and corrupt parsing.

.PARAMETER AppBackendDir
  Path to the eyeconic-app backend. Default: sibling eyeconic-app\backend
  next to this repo.

.PARAMETER SkipSpawn
  Dry run: report what would start, spawn nothing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-all.ps1
#>
[CmdletBinding()]
param(
  [string]$AppBackendDir = '',
  [switch]$SkipSpawn
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $AppBackendDir) {
  # Default: sibling eyeconic-app\backend next to this repo.
  $AppBackendDir = Join-Path (Split-Path $RepoRoot -Parent) 'eyeconic-app\backend'
}

# name -> @{ Port; Dir; Command; Probe; Marker }; started in order, backend
# first so the proxy's first call after a fresh website login already has an
# upstream. Probe/Marker identify OUR service on the port (HTTP signature).
$Services = [ordered]@{
  'app-backend'    = @{ Port = 3000; Dir = $AppBackendDir; Probe = 'http://localhost:3000/api/health';           Marker = 'eyeconic-api'; Command = 'npm run dev' }
  'website-server' = @{ Port = 5000; Dir = (Join-Path $RepoRoot 'server'); Probe = 'http://localhost:5000/api/app-auth/session'; Marker = 'user';      Command = 'npm run dev' }
  'website-client' = @{ Port = 5173; Dir = (Join-Path $RepoRoot 'client'); Probe = 'http://localhost:5173/';                           Marker = 'Eyeconic';   Command = 'npm run dev' }
}

function Get-PortOwnerPid([int]$Port) {
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $conn) { return $null }
  return $conn.OwningProcess
}

# Returns 'free' (nothing on the port), 'ours' (our service answered the
# signature probe) or 'foreign' (something else holds the port).
function Test-ServiceState([string]$Probe, [string]$Marker, [int]$Port) {
  if ($null -eq (Get-PortOwnerPid $Port)) { return 'free' }
  try {
    $response = Invoke-WebRequest -Uri $Probe -UseBasicParsing -TimeoutSec 5
    $body = [string]$response.Content
    if ($response.StatusCode -eq 200 -and $body.Contains($Marker)) { return 'ours' }
    return 'foreign'
  } catch {
    return 'foreign'
  }
}

$foreignPorts = 0

foreach ($name in $Services.Keys) {
  $svc = $Services[$name]
  if (-not (Test-Path (Join-Path $svc.Dir 'package.json'))) {
    Write-Warning "[$name] skipped -- no package.json in $($svc.Dir)"
    continue
  }

  $state = Test-ServiceState -Probe $svc.Probe -Marker $svc.Marker -Port $svc.Port
  if ($state -eq 'ours') {
    Write-Host "[$name] already running on port $($svc.Port) -- skipped" -ForegroundColor Yellow
    continue
  }
  if ($state -eq 'foreign') {
    $ownerPid = Get-PortOwnerPid $svc.Port
    $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { 'unknown' }
    Write-Host "[$name] ERROR: port $($svc.Port) is held by another process ('$procName', pid $ownerPid), not the Eyeconic $name." -ForegroundColor Red
    Write-Host "        The dev stack needs this port. Close/relocate that process, then re-run dev-all.ps1." -ForegroundColor Red
    $foreignPorts++
    continue
  }

  Write-Host "[$name] starting on port $($svc.Port) ($($svc.Dir))" -ForegroundColor Green
  if ($SkipSpawn) { continue }
  # Own window per service: logs stay visible and closing one window stops
  # only that service.
  Start-Process -FilePath 'powershell' -WorkingDirectory $svc.Dir -WindowStyle Normal @(
    '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'eyeconic $name'; $($svc.Command)"
  )
  # Give each listener a moment so the backend-first ordering stays
  # meaningful (nodemon + express boot in ~1-3s).
  Start-Sleep -Seconds 3
}

Write-Host ''
Write-Host 'Stack: app backend http://localhost:3000 | server http://localhost:5000 | client http://localhost:5173' -ForegroundColor Cyan
Write-Host 'Log in at http://localhost:5173/login (dashboard: /dashboard, tests: /tests)'
if ($foreignPorts -gt 0) {
  Write-Host ''
  Write-Host "$foreignPorts service port(s) are held by foreign processes -- fix the conflicts above and re-run." -ForegroundColor Red
  exit 1
}
