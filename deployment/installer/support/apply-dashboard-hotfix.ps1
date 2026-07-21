param(
  [Parameter(Mandatory = $true)][string]$InstallRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$bootstrapScript = Join-Path $InstallRoot 'support\bootstrap-stack.ps1'
$envPath = Join-Path $InstallRoot 'app\.env'
$manifestPath = Join-Path $InstallRoot 'metadata\service-manifest.json'

function Read-EnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) {
      continue
    }

    $separatorIndex = $trimmed.IndexOf('=')
    if ($separatorIndex -lt 1) {
      continue
    }

    $key = $trimmed.Substring(0, $separatorIndex).Trim()
    if ($key -ne $Name) {
      continue
    }

    return $trimmed.Substring($separatorIndex + 1)
  }

  return $null
}

function Resolve-RuntimeRoot {
  $runtimeRoot = Read-EnvValue -Path $envPath -Name 'ITDASH_RUNTIME_ROOT'
  if (-not [string]::IsNullOrWhiteSpace($runtimeRoot)) {
    return [System.IO.Path]::GetFullPath($runtimeRoot)
  }

  if (Test-Path -LiteralPath $manifestPath) {
    try {
      $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
      if (-not [string]::IsNullOrWhiteSpace($manifest.runtimeRoot)) {
        return [System.IO.Path]::GetFullPath([string]$manifest.runtimeRoot)
      }
    } catch {
    }
  }

  return $InstallRoot
}

if (-not (Test-Path -LiteralPath $bootstrapScript)) {
  throw "Bootstrap helper not found at $bootstrapScript"
}

$runtimeRoot = Resolve-RuntimeRoot

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrapScript -InstallRoot $InstallRoot -RuntimeRoot $runtimeRoot
if ($LASTEXITCODE -ne 0) {
  throw "Dashboard hotfix restart failed with exit code $LASTEXITCODE"
}

Write-Output "Dashboard hotfix applied successfully to $InstallRoot"
