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
$pm2PathsFile = Join-Path $InstallRoot 'runtime-tools\node_modules\pm2\paths.js'
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

function Set-DashboardPm2PipeNames {
  param([Parameter(Mandatory = $true)][string]$PathsFile)

  if (-not (Test-Path -LiteralPath $PathsFile)) {
    throw "PM2 runtime patch prerequisite missing: $PathsFile"
  }

  $content = Get-Content -LiteralPath $PathsFile -Raw
  $patched = $content
  $patched = $patched.Replace(
    "pm2_file_stucture.DAEMON_RPC_PORT = '\\\\.\\pipe\\rpc.sock';",
    "pm2_file_stucture.DAEMON_RPC_PORT = '\\\\.\\pipe\\itdash-pm2-rpc.sock';"
  )
  $patched = $patched.Replace(
    "pm2_file_stucture.DAEMON_PUB_PORT = '\\\\.\\pipe\\pub.sock';",
    "pm2_file_stucture.DAEMON_PUB_PORT = '\\\\.\\pipe\\itdash-pm2-pub.sock';"
  )
  $patched = $patched.Replace(
    "pm2_file_stucture.INTERACTOR_RPC_PORT = '\\\\.\\pipe\\interactor.sock';",
    "pm2_file_stucture.INTERACTOR_RPC_PORT = '\\\\.\\pipe\\itdash-pm2-interactor.sock';"
  )

  if ($patched -eq $content) {
    if ($content -notmatch 'itdash-pm2-rpc\.sock') {
      throw 'PM2 runtime patch failed: expected Windows pipe constants were not found.'
    }
    return
  }

  Set-Content -LiteralPath $PathsFile -Value $patched -NoNewline
}

function Assert-Pm2AppsOnline {
  param(
    [Parameter(Mandatory = $true)][string]$NodeExePath,
    [Parameter(Mandatory = $true)][string]$Pm2ScriptPath
  )

  $expectedNames = @(
    'api-gateway',
    'nutanix-collector',
    'solarwinds-collector',
    'symphony-collector',
    'dashboard-ui',
    'dashboard-frontdoor-operator',
    'dashboard-frontdoor-admin'
  )

  $rawList = & $NodeExePath $Pm2ScriptPath jlist
  if ($LASTEXITCODE -ne 0) {
    throw "PM2 jlist failed with exit code $LASTEXITCODE"
  }

  $processes = @($rawList | ConvertFrom-Json)
  $statusByName = @{}
  foreach ($process in $processes) {
    $name = [string]$process.name
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }

    $statusByName[$name] = [string]$process.pm2_env.status
  }

  $notOnline = @()
  foreach ($expectedName in $expectedNames) {
    if (-not $statusByName.ContainsKey($expectedName)) {
      $notOnline += "$expectedName=missing"
      continue
    }

    if ($statusByName[$expectedName] -ne 'online') {
      $notOnline += "$expectedName=$($statusByName[$expectedName])"
    }
  }

  if ($notOnline.Count -gt 0) {
    throw "PM2 bootstrap did not bring all dashboard processes online: $($notOnline -join ', ')"
  }
}

Assert-RequiredPath -Path $nodeExe -Description 'bundled Node runtime'
Assert-RequiredPath -Path $pm2Script -Description 'bundled PM2 runtime'
Assert-RequiredPath -Path $pm2PathsFile -Description 'bundled PM2 runtime paths'
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

Set-DashboardPm2PipeNames -PathsFile $pm2PathsFile

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

  Assert-Pm2AppsOnline -NodeExePath $nodeExe -Pm2ScriptPath $pm2Script
} finally {
  Pop-Location
}

Write-Output "Dashboard stack bootstrapped successfully"
