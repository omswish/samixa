param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$RuntimeRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$appRoot = Join-Path $InstallRoot 'app'
$nodeExe = Join-Path $InstallRoot 'runtime\node\node.exe'
$pm2Script = Join-Path $InstallRoot 'runtime-tools\node_modules\pm2\bin\pm2'
$pm2Home = Join-Path $RuntimeRoot 'pm2'

[System.IO.Directory]::CreateDirectory($pm2Home) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $appRoot 'data')) | Out-Null

$env:PM2_HOME = $pm2Home
$env:Path = "$(Split-Path -Parent $nodeExe);$env:Path"

Push-Location $appRoot
try {
  try {
    & $nodeExe $pm2Script delete all | Out-Null
  } catch {
    # Ignore cleanup failure on first run.
  }

  & $nodeExe $pm2Script startOrRestart (Join-Path $appRoot 'ecosystem.config.js') --update-env
  if ($LASTEXITCODE -ne 0) {
    throw "PM2 startOrRestart failed with exit code $LASTEXITCODE"
  }

  & $nodeExe $pm2Script save
  if ($LASTEXITCODE -ne 0) {
    throw "PM2 save failed with exit code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

Write-Output "Dashboard stack bootstrapped successfully"
