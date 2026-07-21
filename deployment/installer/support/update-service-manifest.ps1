param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [string]$RuntimeRoot = '',
  [Parameter(Mandatory = $true)][int]$OperatorPort,
  [Parameter(Mandatory = $true)][int]$AdminPort
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
  $RuntimeRoot = $InstallRoot
}
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)

$manifestTargets = @(
  (Join-Path $InstallRoot 'metadata\service-manifest.json')
)

foreach ($manifestPath in $manifestTargets) {
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    continue
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $manifest.runtimeRoot = $RuntimeRoot
  $manifest.frontdoorPort = $OperatorPort
  $manifest.adminPort = $AdminPort

  foreach ($service in $manifest.services) {
    if ($service.id -eq 'dashboard-frontdoor-operator') {
      $service.listen = "0.0.0.0:$OperatorPort"
      $service.healthTarget = "http://127.0.0.1:$OperatorPort/login"
    }

    if ($service.id -eq 'dashboard-frontdoor-admin') {
      $service.listen = "0.0.0.0:$AdminPort"
      $service.healthTarget = "http://127.0.0.1:$AdminPort/login"
    }
  }

  foreach ($workflow in $manifest.sessionWorkflows) {
    if ($workflow.id -eq 'symphony') {
      foreach ($target in $workflow.targets) {
        if ($target.id -eq 'primary') {
          $target.path = Join-Path $RuntimeRoot 'sessions\symphony\symphony-storage-state.json'
        }

        if ($target.id -eq 'interactive-profile') {
          $target.path = Join-Path $RuntimeRoot 'sessions\symphony\interactive-edge-profile'
        }

        if ($target.id -eq 'helper-root') {
          $target.path = Join-Path $RuntimeRoot 'admin\reauth'
        }
      }
    }

    if ($workflow.id -eq 'solarwinds') {
      foreach ($target in $workflow.targets) {
        if ($target.id -eq 'servers') {
          $target.path = Join-Path $RuntimeRoot 'sessions\solarwinds\solarwinds-servers-storage-state.json'
        }

        if ($target.id -eq 'networks') {
          $target.path = Join-Path $RuntimeRoot 'sessions\solarwinds\solarwinds-networks-storage-state.json'
        }
      }
    }
  }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8),
    $utf8NoBom
  )
}

Write-Output "Updated service manifest for runtime root $RuntimeRoot, operator port $OperatorPort, and admin port $AdminPort"
