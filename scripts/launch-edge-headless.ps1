# Launch headless Edge with a CDP port for UI verification (dev-only helper).
# Usage: powershell -File scripts\launch-edge-headless.ps1 <port> <profile-suffix>
param(
  [int]$Port = 9222,
  [string]$ProfileSuffix = 'cdp'
)
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe' }
$profile = Join-Path $env:TEMP "edge-$ProfileSuffix"
$args = @(
  '--headless=new',
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  '--no-first-run', '--disable-gpu', '--window-size=1380,1000',
  'about:blank'
)
Start-Process -FilePath $edge -ArgumentList $args
Write-Output "edge launched on port $Port (profile $profile)"
