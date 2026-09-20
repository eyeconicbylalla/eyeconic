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
  This script starts all three services, each in its own window, skipping
  any that are already listening on their port.

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

# name -> @{ Port; Dir; Command }; started in order, backend first so the
# proxy's first call after a fresh website login already has an upstream.
$Services = [ordered]@{
  'app-backend'    = @{ Port = 3000; Dir = $AppBackendDir;                              Command = 'npm run dev' }
  'website-server' = @{ Port = 5000; Dir = (Join-Path $RepoRoot 'server'); Command = 'npm run dev' }
  'website-client' = @{ Port = 5173; Dir = (Join-Path $RepoRoot 'client'); Command = 'npm run dev' }
}

function Test-PortListening([int]$Port) {
  return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

foreach ($name in $Services.Keys) {
  $svc = $Services[$name]
  if (-not (Test-Path (Join-Path $svc.Dir 'package.json'))) {
    Write-Warning "[$name] skipped -- no package.json in $($svc.Dir)"
    continue
  }
  if (Test-PortListening $svc.Port) {
    Write-Host "[$name] already running on port $($svc.Port) -- skipped" -ForegroundColor Yellow
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
