param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [string]$RuntimeUser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)

$appRoot = Join-Path $InstallRoot 'app'
$nodeExe = Join-Path $InstallRoot 'runtime\node\node.exe'
$pm2Script = Join-Path $InstallRoot 'runtime-tools\node_modules\pm2\bin\pm2'
$pm2Home = Join-Path $RuntimeRoot 'pm2'
$pm2PidFile = Join-Path $pm2Home 'pm2.pid'
$ecosystemConfig = Join-Path $appRoot 'ecosystem.config.js'
$nextRuntime = Join-Path $appRoot 'node_modules\next\dist\bin\next'
$permissionRepairScript = @(
  (Join-Path $InstallRoot 'support\repair-runtime-permissions.ps1'),
  (Join-Path $PSScriptRoot 'repair-runtime-permissions.ps1')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

function Assert-RequiredPath {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Description
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Bootstrap prerequisite missing: $Description ($Path)"
  }
}

function Stop-StalePm2ProcessTree {
  param([Parameter(Mandatory = $true)][string]$PidFilePath)

  if (-not (Test-Path -LiteralPath $PidFilePath)) {
    return
  }

  $rawPid = (Get-Content -LiteralPath $PidFilePath -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  $parsedPid = 0
  if (-not [int]::TryParse($rawPid, [ref]$parsedPid)) {
    return
  }

  $pm2Pid = $parsedPid
  $process = Get-Process -Id $pm2Pid -ErrorAction SilentlyContinue
  if (-not $process) {
    return
  }

  & taskkill.exe /PID $pm2Pid /T /F | Out-Null
  Start-Sleep -Seconds 2
  if (Get-Process -Id $pm2Pid -ErrorAction SilentlyContinue) {
    throw "Unable to stop the existing PM2 daemon process tree (PID $pm2Pid)."
  }
}

Assert-RequiredPath -Path $nodeExe -Description 'bundled Node runtime'
Assert-RequiredPath -Path $pm2Script -Description 'bundled PM2 runtime'
Assert-RequiredPath -Path $ecosystemConfig -Description 'ecosystem.config.js'
Assert-RequiredPath -Path $nextRuntime -Description 'Next.js production runtime'
Assert-RequiredPath -Path $permissionRepairScript -Description 'runtime permission repair helper'

$permissionRepairArguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', $permissionRepairScript,
  '-InstallRoot', $InstallRoot,
  '-RuntimeRoot', $RuntimeRoot
)

if (-not [string]::IsNullOrWhiteSpace($RuntimeUser)) {
  $permissionRepairArguments += @('-RuntimeUser', $RuntimeUser)
}

& powershell.exe @permissionRepairArguments
if ($LASTEXITCODE -ne 0) {
  throw "Runtime permission repair failed with exit code $LASTEXITCODE"
}

[System.IO.Directory]::CreateDirectory($pm2Home) | Out-Null
[System.IO.Directory]::CreateDirectory((Join-Path $appRoot 'data')) | Out-Null

Stop-StalePm2ProcessTree -PidFilePath $pm2PidFile

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
