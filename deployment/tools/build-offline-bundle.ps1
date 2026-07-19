param(
  [string]$BundleName = "utkal-it-dashboard-offline-server-bundle-$(Get-Date -Format 'yyyy-MM-dd')",
  [string]$PostgresSourceRoot = 'C:\Program Files\PostgreSQL\18',
  [string]$ReleaseRoot = (Join-Path $PSScriptRoot '..\release')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-RobocopyMirror {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Source path not found: $Source"
  }

  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  & robocopy $Source $Destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed for $Source -> $Destination with exit code $LASTEXITCODE"
  }
}

function Remove-DirectoryRobustly {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  try {
    Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
  } catch {
    cmd /c rd /s /q "$Path" | Out-Null
    if (Test-Path -LiteralPath $Path) {
      throw "Failed to remove directory: $Path"
    }
  }
}

$deploymentRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedReleaseRoot = [System.IO.Path]::GetFullPath($ReleaseRoot)
$bundleRoot = Join-Path $resolvedReleaseRoot $BundleName
$zipPath = Join-Path $resolvedReleaseRoot ($BundleName + '.zip')
$sevenZipCommand = Get-Command 7z -ErrorAction SilentlyContinue
$tarCommand = Get-Command tar.exe -ErrorAction SilentlyContinue

if (-not (Test-Path -LiteralPath (Join-Path $deploymentRoot 'staging\current\app'))) {
  throw 'Staged deployment payload not found. Build staging/current first.'
}

$bundledPostgresAvailable = @(
  (Join-Path $PostgresSourceRoot 'bin'),
  (Join-Path $PostgresSourceRoot 'lib'),
  (Join-Path $PostgresSourceRoot 'share'),
  (Join-Path $PostgresSourceRoot 'installer')
) | ForEach-Object {
  Test-Path -LiteralPath $_
} | Where-Object { $_ -eq $false } | Measure-Object | Select-Object -ExpandProperty Count

if ($bundledPostgresAvailable -gt 0) {
  Write-Warning "Bundled PostgreSQL source is incomplete under $PostgresSourceRoot. The offline bundle will be created without local PostgreSQL payload."
}

[System.IO.Directory]::CreateDirectory($resolvedReleaseRoot) | Out-Null
Remove-DirectoryRobustly -Path $bundleRoot
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
[System.IO.Directory]::CreateDirectory($bundleRoot) | Out-Null

foreach ($fileName in @(
  'install-offline-server.bat',
  'install-offline-server.ps1',
  'deploy-windows-server.bat'
)) {
  Copy-Item -LiteralPath (Join-Path $deploymentRoot $fileName) -Destination (Join-Path $bundleRoot $fileName) -Force
}

Invoke-RobocopyMirror -Source (Join-Path $deploymentRoot 'installer\support') -Destination (Join-Path $bundleRoot 'installer\support')
Invoke-RobocopyMirror -Source (Join-Path $deploymentRoot 'staging\current') -Destination (Join-Path $bundleRoot 'staging\current')
Invoke-RobocopyMirror -Source (Join-Path $deploymentRoot 'postgres\support') -Destination (Join-Path $bundleRoot 'postgres\support')

[System.IO.Directory]::CreateDirectory((Join-Path $bundleRoot 'docs')) | Out-Null
foreach ($docPath in @(
  (Join-Path $deploymentRoot 'README.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\README.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\product-requirements-document.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\project-documentation-and-timeline.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\system-design.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\user-manual.md'),
  (Join-Path (Split-Path $deploymentRoot -Parent) 'docs\developer-handbook.md')
)) {
  if (Test-Path -LiteralPath $docPath) {
    Copy-Item -LiteralPath $docPath -Destination (Join-Path $bundleRoot ("docs\" + (Split-Path $docPath -Leaf))) -Force
  }
}

if ($bundledPostgresAvailable -eq 0) {
  Invoke-RobocopyMirror -Source (Join-Path $PostgresSourceRoot 'bin') -Destination (Join-Path $bundleRoot 'postgres\runtime\bin')
  Invoke-RobocopyMirror -Source (Join-Path $PostgresSourceRoot 'lib') -Destination (Join-Path $bundleRoot 'postgres\runtime\lib')
  Invoke-RobocopyMirror -Source (Join-Path $PostgresSourceRoot 'share') -Destination (Join-Path $bundleRoot 'postgres\runtime\share')
  Invoke-RobocopyMirror -Source (Join-Path $PostgresSourceRoot 'installer') -Destination (Join-Path $bundleRoot 'postgres\runtime\installer')

  if (Test-Path -LiteralPath (Join-Path $PostgresSourceRoot 'scripts')) {
    Invoke-RobocopyMirror -Source (Join-Path $PostgresSourceRoot 'scripts') -Destination (Join-Path $bundleRoot 'postgres\runtime\scripts')
  }

  foreach ($fileName in @(
    'pg_env.bat',
    'server_license.txt',
    'commandlinetools_3rd_party_licenses.txt',
    'StackBuilder_3rd_party_licenses.txt'
  )) {
    $sourceFile = Join-Path $PostgresSourceRoot $fileName
    if (Test-Path -LiteralPath $sourceFile) {
      Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $bundleRoot "postgres\runtime\$fileName") -Force
    }
  }
}

$manifestPath = Join-Path $bundleRoot 'BUNDLE_CONTENTS.txt'
$manifestLines = @(
  'UAIL IT Dashboard Offline Server Bundle',
  ('Generated on: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')),
  '',
  'Primary entry point:',
  '  install-offline-server.bat',
  '',
  'Included major payloads:',
  '  staging\current',
  '  installer\support',
  '  postgres\support',
  '  docs',
  '',
  'Optional payloads when available:',
  '  postgres\runtime',
  '',
  'Exposed web surfaces after install:',
  '  operator: http://<server>:21060/login',
  '  admin:    http://<server>:21061/login'
)
Set-Content -LiteralPath $manifestPath -Value $manifestLines -Encoding UTF8

if ($sevenZipCommand) {
  Push-Location $resolvedReleaseRoot
  try {
    & $sevenZipCommand.Source a -tzip $zipPath $BundleName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "7-Zip failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} elseif ($tarCommand) {
  Push-Location $resolvedReleaseRoot
  try {
    & $tarCommand.Source -a -c -f $zipPath $BundleName
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
} else {
  Compress-Archive -Path $bundleRoot -DestinationPath $zipPath -CompressionLevel Optimal
}

Write-Output "Bundle directory: $bundleRoot"
Write-Output "Bundle zip: $zipPath"
