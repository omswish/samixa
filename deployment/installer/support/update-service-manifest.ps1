param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][int]$OperatorPort,
  [Parameter(Mandatory = $true)][int]$AdminPort
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$manifestTargets = @(
  (Join-Path $InstallRoot 'metadata\service-manifest.json')
)

foreach ($manifestPath in $manifestTargets) {
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    continue
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
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

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText(
    $manifestPath,
    ($manifest | ConvertTo-Json -Depth 8),
    $utf8NoBom
  )
}

Write-Output "Updated service manifest for operator port $OperatorPort and admin port $AdminPort"
