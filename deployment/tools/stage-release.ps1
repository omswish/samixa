param(
  [string]$StageRoot = (Join-Path $PSScriptRoot '..\staging\current'),
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$deploymentRoot = Join-Path $repoRoot 'deployment'
$runtimeToolsRoot = Join-Path $deploymentRoot 'runtime-tools'
$stageRootResolved = [System.IO.Path]::GetFullPath($StageRoot)

function Invoke-RobocopyMirror {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExtraArgs = @()
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    return
  }

  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  $baseArgs = @($Source, $Destination, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
  & robocopy @baseArgs @ExtraArgs | Out-Null
  $exitCode = $LASTEXITCODE
  if ($exitCode -ge 8) {
    throw "robocopy failed for $Source -> $Destination with exit code $exitCode"
  }
}

function Remove-DirectoryRobustly {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  function Get-LongPath {
    param([string]$Value)

    $resolved = [System.IO.Path]::GetFullPath($Value)
    if ($resolved.StartsWith('\\?\')) {
      return $resolved
    }

    if ($resolved.StartsWith('\\')) {
      return '\\?\UNC\' + $resolved.Substring(2)
    }

    return '\\?\' + $resolved
  }

  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    return
  } catch {
    $emptyDir = Join-Path ([System.IO.Path]::GetTempPath()) ('samixa-empty-' + [System.Guid]::NewGuid().ToString('N'))
    try {
      [System.IO.Directory]::CreateDirectory($emptyDir) | Out-Null
      Invoke-RobocopyMirror -Source $emptyDir -Destination $Path -ExtraArgs @('/MIR')
    } finally {
      if (Test-Path -LiteralPath $emptyDir) {
        Remove-Item -LiteralPath $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }

  $items = Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending

  foreach ($item in $items) {
    $longPath = Get-LongPath -Value $item.FullName
    if ($item.PSIsContainer) {
      try {
        [System.IO.Directory]::Delete($longPath, $false)
      } catch {
      }
    } else {
      try {
        [System.IO.File]::SetAttributes($longPath, [System.IO.FileAttributes]::Normal)
      } catch {
      }

      try {
        [System.IO.File]::Delete($longPath)
      } catch {
      }
    }
  }

  [System.IO.Directory]::Delete((Get-LongPath -Value $Path), $true)
}

if (-not $SkipBuild) {
  Push-Location $repoRoot
  try {
    npm run build
  } finally {
    Pop-Location
  }

  Push-Location $runtimeToolsRoot
  try {
    npm install
  } finally {
    Pop-Location
  }
}

if (Test-Path -LiteralPath $stageRootResolved) {
  Remove-DirectoryRobustly -Path $stageRootResolved
}
[System.IO.Directory]::CreateDirectory($stageRootResolved) | Out-Null

$appStage = Join-Path $stageRootResolved 'app'
$runtimeStage = Join-Path $stageRootResolved 'runtime'
$runtimeNodeStage = Join-Path $runtimeStage 'node'
$runtimeToolsStage = Join-Path $stageRootResolved 'runtime-tools'
$metadataStage = Join-Path $stageRootResolved 'metadata'

[System.IO.Directory]::CreateDirectory($appStage) | Out-Null
[System.IO.Directory]::CreateDirectory($runtimeNodeStage) | Out-Null
[System.IO.Directory]::CreateDirectory($runtimeToolsStage) | Out-Null
[System.IO.Directory]::CreateDirectory($metadataStage) | Out-Null

$rootFiles = @(
  'package.json',
  'package-lock.json',
  '.env.example',
  'ecosystem.config.js'
)

foreach ($relativeFile in $rootFiles) {
  $sourceFile = Join-Path $repoRoot $relativeFile
  if (Test-Path -LiteralPath $sourceFile) {
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $appStage $relativeFile) -Force
  }
}

$workspaceCopyMap = @(
  @{ Source = 'api-gateway\dist'; Destination = 'api-gateway\dist' },
  @{ Source = 'api-gateway\sql'; Destination = 'api-gateway\sql' },
  @{ Source = 'api-gateway\package.json'; Destination = 'api-gateway\package.json' },
  @{ Source = 'collectors\nutanix\dist'; Destination = 'collectors\nutanix\dist' },
  @{ Source = 'collectors\nutanix\package.json'; Destination = 'collectors\nutanix\package.json' },
  @{ Source = 'collectors\solarwinds\dist'; Destination = 'collectors\solarwinds\dist' },
  @{ Source = 'collectors\solarwinds\package.json'; Destination = 'collectors\solarwinds\package.json' },
  @{ Source = 'collectors\symphony\dist'; Destination = 'collectors\symphony\dist' },
  @{ Source = 'collectors\symphony\package.json'; Destination = 'collectors\symphony\package.json' },
  @{ Source = 'dashboard\.next'; Destination = 'dashboard\.next' },
  @{ Source = 'dashboard\package.json'; Destination = 'dashboard\package.json' },
  @{ Source = 'dashboard\next.config.js'; Destination = 'dashboard\next.config.js' },
  @{ Source = 'frontdoor-proxy\dist'; Destination = 'frontdoor-proxy\dist' },
  @{ Source = 'frontdoor-proxy\package.json'; Destination = 'frontdoor-proxy\package.json' }
)

foreach ($entry in $workspaceCopyMap) {
  $sourcePath = Join-Path $repoRoot $entry.Source
  $destinationPath = Join-Path $appStage $entry.Destination
  if ((Get-Item -LiteralPath $sourcePath).PSIsContainer) {
    Invoke-RobocopyMirror -Source $sourcePath -Destination $destinationPath
  } else {
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destinationPath)) | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
  }
}

Invoke-RobocopyMirror -Source (Join-Path $repoRoot 'node_modules') -Destination (Join-Path $appStage 'node_modules')

$workspaceLinkTargets = @(
  'api-gateway',
  'dashboard-ui',
  'frontdoor-proxy',
  'nutanix-collector',
  'solarwinds-collector',
  'symphony-collector'
)

foreach ($entry in $workspaceLinkTargets) {
  $candidate = Join-Path $appStage "node_modules\$entry"
  if (Test-Path -LiteralPath $candidate) {
    Remove-Item -LiteralPath $candidate -Recurse -Force
  }
}

$stagedCleanupPaths = @(
  (Join-Path $appStage 'dashboard\.next\cache'),
  (Join-Path $appStage 'dashboard\runtime')
)

foreach ($cleanupPath in $stagedCleanupPaths) {
  if (Test-Path -LiteralPath $cleanupPath) {
    Remove-Item -LiteralPath $cleanupPath -Recurse -Force
  }
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodeInstallDir = Split-Path -Parent $nodeCommand.Source
Invoke-RobocopyMirror -Source $nodeInstallDir -Destination $runtimeNodeStage

Invoke-RobocopyMirror -Source $runtimeToolsRoot -Destination $runtimeToolsStage -ExtraArgs @('/XD', 'node_modules\.cache')

Copy-Item -LiteralPath (Join-Path $deploymentRoot 'config\service-manifest.json') -Destination (Join-Path $metadataStage 'service-manifest.json') -Force

Write-Output "Staged deployment payload at $stageRootResolved"
