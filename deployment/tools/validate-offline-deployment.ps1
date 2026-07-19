param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '..'),
  [string]$SourceEnvPath = (Join-Path (Join-Path $PSScriptRoot '..\..') '.env'),
  [string]$TempRoot = (Join-Path $env:TEMP 'utkal-it-dashboard-smoke'),
  [int]$OperatorPort = 22160,
  [int]$AdminPort = 22161,
  [switch]$KeepInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-EnvMap {
  param(
    [Parameter(Mandatory = $true)][string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Environment file not found: $Path"
  }

  $map = @{}
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
    $value = $trimmed.Substring($separatorIndex + 1)
    $map[$key] = $value
  }

  return $map
}

function Get-RequiredEnvValue {
  param(
    [Parameter(Mandatory = $true)][hashtable]$EnvMap,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $value = $EnvMap[$Name]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required setting missing in env file: $Name"
  }

  return $value
}

function Get-RequiredEnvValueFromAny {
  param(
    [Parameter(Mandatory = $true)][hashtable]$EnvMap,
    [Parameter(Mandatory = $true)][string[]]$Names
  )

  foreach ($name in $Names) {
    $value = $EnvMap[$name]
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }

  throw "Required setting missing in env file. Checked: $($Names -join ', ')"
}

function New-RandomHex {
  param(
    [int]$ByteCount = 32
  )

  $buffer = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($buffer)
  } finally {
    $rng.Dispose()
  }

  return ([System.BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant())
}

function Wait-HttpOk {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$Attempts = 40,
    [int]$DelaySeconds = 3
  )

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
        return $response
      }
    } catch {
      if ($attempt -eq $Attempts) {
        throw "Timed out waiting for $Url"
      }
    }

    Start-Sleep -Seconds $DelaySeconds
  }

  throw "Timed out waiting for $Url"
}

function Invoke-Login {
  param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Password
  )

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $payload = @{ password = $Password } | ConvertTo-Json -Compress
  $response = Invoke-WebRequest `
    -Uri "$BaseUrl/api/auth/login" `
    -Method Post `
    -WebSession $session `
    -ContentType 'application/json' `
    -Body $payload `
    -UseBasicParsing `
    -TimeoutSec 15

  if ($response.StatusCode -ne 200) {
    throw "Login failed for $BaseUrl with status $($response.StatusCode)"
  }

  return $session
}

function Stop-TemporaryStack {
  param(
    [Parameter(Mandatory = $true)][string]$InstallRoot,
    [Parameter(Mandatory = $true)][string]$RuntimeRoot
  )

  $nodeExe = Join-Path $InstallRoot 'runtime\node\node.exe'
  $pm2Script = Join-Path $InstallRoot 'runtime-tools\node_modules\pm2\bin\pm2'
  $pm2Home = Join-Path $RuntimeRoot 'pm2'

  if (-not (Test-Path -LiteralPath $nodeExe) -or -not (Test-Path -LiteralPath $pm2Script)) {
    return
  }

  $env:PM2_HOME = $pm2Home
  $env:Path = "$(Split-Path -Parent $nodeExe);$env:Path"

  try {
    & $nodeExe $pm2Script delete all | Out-Null
  } catch {
  }

  try {
    & $nodeExe $pm2Script kill | Out-Null
  } catch {
  }
}

function Remove-TreeWithRetries {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$Attempts = 10,
    [int]$DelayMilliseconds = 1500
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
    try {
      Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue |
        ForEach-Object {
          try {
            $_.Attributes = 'Normal'
          } catch {
          }
        }

      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return $true
    } catch {
      if ($attempt -eq $Attempts) {
        Write-Warning "Unable to remove temporary path after $Attempts attempts: $Path"
        return $false
      }

      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }

  return $false
}

$resolvedPackageRoot = [System.IO.Path]::GetFullPath($PackageRoot)
$provisionerPath = Join-Path $resolvedPackageRoot 'installer\support\provision-staged-deployment.ps1'
$installRoot = Join-Path $TempRoot 'install'
$runtimeRoot = Join-Path $TempRoot 'runtime'
$operatorUrl = "http://127.0.0.1:$OperatorPort"
$adminUrl = "http://127.0.0.1:$AdminPort"
$appPassword = '17172737'

if ($OperatorPort -eq $AdminPort) {
  throw 'OperatorPort and AdminPort must be different.'
}

if (-not (Test-Path -LiteralPath $provisionerPath)) {
  throw "Provisioner not found: $provisionerPath"
}

$envMap = Get-EnvMap -Path $SourceEnvPath
$secretStorePassphrase = New-RandomHex -ByteCount 32

Remove-TreeWithRetries -Path $TempRoot | Out-Null

[System.IO.Directory]::CreateDirectory($TempRoot) | Out-Null

try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $provisionerPath `
    -PackageRoot $resolvedPackageRoot `
    -InstallRoot $installRoot `
    -RuntimeRoot $runtimeRoot `
    -SecretStorePassphrase $secretStorePassphrase `
    -NutanixHost (Get-RequiredEnvValue -EnvMap $envMap -Name 'NUTANIX_HOST') `
    -NutanixPort ([int](Get-RequiredEnvValue -EnvMap $envMap -Name 'NUTANIX_PORT')) `
    -NutanixUser (Get-RequiredEnvValue -EnvMap $envMap -Name 'NUTANIX_USER') `
    -NutanixPassword (Get-RequiredEnvValue -EnvMap $envMap -Name 'NUTANIX_PASS') `
    -SolarWindsServersHost (Get-RequiredEnvValue -EnvMap $envMap -Name 'SW_HOST_SERVERS') `
    -SolarWindsNetworksHost (Get-RequiredEnvValue -EnvMap $envMap -Name 'SW_HOST_NETWORKS') `
    -SolarWindsServersUser (Get-RequiredEnvValueFromAny -EnvMap $envMap -Names @('SW_SERVERS_USER', 'SW_USER')) `
    -SolarWindsServersPassword (Get-RequiredEnvValueFromAny -EnvMap $envMap -Names @('SW_SERVERS_PASS', 'SW_PASS')) `
    -SolarWindsNetworksUser (Get-RequiredEnvValueFromAny -EnvMap $envMap -Names @('SW_NETWORKS_USER', 'SW_USER')) `
    -SolarWindsNetworksPassword (Get-RequiredEnvValueFromAny -EnvMap $envMap -Names @('SW_NETWORKS_PASS', 'SW_PASS')) `
    -SymphonyUrl (Get-RequiredEnvValue -EnvMap $envMap -Name 'SYM_URL') `
    -SymphonyUser (Get-RequiredEnvValue -EnvMap $envMap -Name 'SYM_USER') `
    -SymphonyPassword (Get-RequiredEnvValue -EnvMap $envMap -Name 'SYM_PASS') `
    -OperatorPort $OperatorPort `
    -AdminPort $AdminPort `
    -NonInteractive `
    -SkipFirewallRule `
    -SkipAutostart

  if ($LASTEXITCODE -ne 0) {
    throw "Provisioner exited with code $LASTEXITCODE"
  }

  $operatorLoginResponse = Wait-HttpOk -Url "$operatorUrl/login"
  $adminLoginResponse = Wait-HttpOk -Url "$adminUrl/login"

  if ($operatorLoginResponse.Content -notmatch 'operator password') {
    throw 'Operator login screen did not render the expected operator-only prompt.'
  }

  if ($adminLoginResponse.Content -notmatch 'admin password') {
    throw 'Admin login screen did not render the expected admin-only prompt.'
  }

  $adminSession = Invoke-Login -BaseUrl $adminUrl -Password $appPassword
  $servicesResponse = Invoke-WebRequest `
    -Uri "$adminUrl/api/admin/services" `
    -WebSession $adminSession `
    -UseBasicParsing `
    -TimeoutSec 20

  if ($servicesResponse.StatusCode -ne 200) {
    throw "Admin services endpoint returned $($servicesResponse.StatusCode)"
  }

  if ($servicesResponse.Content -notmatch 'dashboard-frontdoor-admin') {
    throw 'Admin services endpoint did not include the expected dashboard service payload.'
  }

  Write-Host 'Offline deployment smoke test passed.'
  Write-Host "Operator URL responded at $operatorUrl/login"
  Write-Host "Admin URL responded at $adminUrl/login"
  Write-Host 'Admin login and service inventory endpoint both validated.'
} finally {
  Stop-TemporaryStack -InstallRoot $installRoot -RuntimeRoot $runtimeRoot

  if (-not $KeepInstall -and (Test-Path -LiteralPath $TempRoot)) {
    Remove-TreeWithRetries -Path $TempRoot | Out-Null
  }
}
