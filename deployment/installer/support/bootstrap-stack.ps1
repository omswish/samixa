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
$ecosystemConfig = Join-Path $appRoot 'ecosystem.config.js'
$nextRuntime = Join-Path $appRoot 'node_modules\next\dist\bin\next'

function Assert-RequiredPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Bootstrap prerequisite missing: $Description ($Path)"
  }
}

Assert-RequiredPath -Path $nodeExe -Description 'bundled Node runtime'
Assert-RequiredPath -Path $pm2Script -Description 'bundled PM2 runtime'
Assert-RequiredPath -Path $ecosystemConfig -Description 'ecosystem.config.js'
Assert-RequiredPath -Path $nextRuntime -Description 'Next.js production runtime'

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

  & $nodeExe $pm2Script startOrRestart $ecosystemConfig --update-env
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
