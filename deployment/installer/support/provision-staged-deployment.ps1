param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '..\..'),
  [string]$InstallRoot = 'C:\ProgramData\UAIL\ITDashboard',
  [string]$RuntimeRoot = '',
  [string]$SecretStorePassphrase = '',
  [string]$NutanixHost = '',
  [int]$NutanixPort = 9440,
  [string]$NutanixUser = '',
  [string]$NutanixPassword = '',
  [string]$SolarWindsServersHost = '',
  [string]$SolarWindsNetworksHost = '',
  [string]$SolarWindsUser = '',
  [string]$SolarWindsPassword = '',
  [string]$SolarWindsServersUser = '',
  [string]$SolarWindsServersPassword = '',
  [string]$SolarWindsNetworksUser = '',
  [string]$SolarWindsNetworksPassword = '',
  [string]$SymphonyUrl = '',
  [string]$SymphonyUser = '',
  [string]$SymphonyPassword = '',
  [int]$OperatorPort = 21060,
  [int]$AdminPort = 21061,
  [switch]$NonInteractive,
  [switch]$SkipFirewallRule,
  [switch]$SkipStartStack,
  [switch]$SkipAutostart,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
  $RuntimeRoot = $InstallRoot
}

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)

if ($OperatorPort -lt 1 -or $OperatorPort -gt 65535) {
  throw 'OperatorPort must be between 1 and 65535.'
}

if ($AdminPort -lt 1 -or $AdminPort -gt 65535) {
  throw 'AdminPort must be between 1 and 65535.'
}

if ($OperatorPort -eq $AdminPort) {
  throw 'OperatorPort and AdminPort must be different.'
}

function ConvertTo-PlainText {
  param(
    [Parameter(Mandatory = $true)][Security.SecureString]$Value
  )

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Read-RequiredText {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Default = ''
  )

  while ($true) {
    if ($Default -ne '') {
      $value = Read-Host "$Prompt [$Default]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        return $Default
      }
    } else {
      $value = Read-Host $Prompt
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value.Trim()
    }
  }
}

function Read-RequiredSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt
  )

  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $plain = ConvertTo-PlainText -Value $secure
    if (-not [string]::IsNullOrWhiteSpace($plain)) {
      return $plain
    }
  }
}

function Read-YesNo {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [bool]$Default
  )

  $suffix = if ($Default) { 'Y/n' } else { 'y/N' }
  while ($true) {
    $answer = Read-Host "$Prompt [$suffix]"
    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $Default
    }

    switch ($answer.Trim().ToLowerInvariant()) {
      'y' { return $true }
      'yes' { return $true }
      'n' { return $false }
      'no' { return $false }
    }
  }
}

function Assert-RequiredValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required in non-interactive mode."
  }
}

function Invoke-RobocopyCopy {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Source path not found: $Source"
  }

  if ($DryRun) {
    Write-Host "[dry-run] copy $Source -> $Destination"
    return
  }

  [System.IO.Directory]::CreateDirectory($Destination) | Out-Null
  & robocopy $Source $Destination /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed for $Source -> $Destination with exit code $LASTEXITCODE"
  }
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

function Invoke-PowerShellScriptChecked {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [string[]]$Arguments = @()
  )

  if ($DryRun) {
    Write-Host "[dry-run] powershell -File $ScriptPath $($Arguments -join ' ')"
    return
  }

  if (-not (Test-Path -LiteralPath $ScriptPath)) {
    throw "PowerShell support script not found: $ScriptPath"
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Support script failed: $ScriptPath (exit code $LASTEXITCODE)"
  }
}

function Invoke-InstalledPowerShellScript {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$Arguments = @()
  )

  Invoke-PowerShellScriptChecked -ScriptPath (Join-Path $InstallRoot "support\$Name") -Arguments $Arguments
}

$resolvedPackageRoot = [System.IO.Path]::GetFullPath($PackageRoot)
$stageRoot = Join-Path $resolvedPackageRoot 'staging\current'
$supportRoot = Join-Path $resolvedPackageRoot 'installer\support'

foreach ($requiredPath in @(
  (Join-Path $stageRoot 'app'),
  (Join-Path $stageRoot 'runtime'),
  (Join-Path $stageRoot 'runtime-tools'),
  (Join-Path $stageRoot 'metadata'),
  $supportRoot
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required deployment path not found: $requiredPath"
  }
}

if ([string]::IsNullOrWhiteSpace($SecretStorePassphrase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SecretStorePassphrase' -Value $SecretStorePassphrase
  } else {
    $SecretStorePassphrase = Read-RequiredSecret -Prompt 'Secret-store passphrase'
  }
}

if ([string]::IsNullOrWhiteSpace($NutanixHost)) {
  if ($NonInteractive) {
    $NutanixHost = '10.23.50.27'
  } else {
    $NutanixHost = Read-RequiredText -Prompt 'Nutanix host' -Default '10.23.50.27'
  }
}
if ([string]::IsNullOrWhiteSpace($NutanixUser)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'NutanixUser' -Value $NutanixUser
  } else {
    $NutanixUser = Read-RequiredText -Prompt 'Nutanix username'
  }
}
if ([string]::IsNullOrWhiteSpace($NutanixPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'NutanixPassword' -Value $NutanixPassword
  } else {
    $NutanixPassword = Read-RequiredSecret -Prompt 'Nutanix password'
  }
}

if ([string]::IsNullOrWhiteSpace($SolarWindsServersHost)) {
  if ($NonInteractive) {
    $SolarWindsServersHost = '10.36.91.45'
  } else {
    $SolarWindsServersHost = Read-RequiredText -Prompt 'SolarWinds servers host' -Default '10.36.91.45'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsNetworksHost)) {
  if ($NonInteractive) {
    $SolarWindsNetworksHost = '10.36.91.46'
  } else {
    $SolarWindsNetworksHost = Read-RequiredText -Prompt 'SolarWinds networks host' -Default '10.36.91.46'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsServersUser)) {
  if (-not [string]::IsNullOrWhiteSpace($SolarWindsUser)) {
    $SolarWindsServersUser = $SolarWindsUser
  } elseif ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsServersUser' -Value $SolarWindsServersUser
  } else {
    $SolarWindsServersUser = Read-RequiredText -Prompt 'SolarWinds servers username'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsServersPassword)) {
  if (-not [string]::IsNullOrWhiteSpace($SolarWindsPassword)) {
    $SolarWindsServersPassword = $SolarWindsPassword
  } elseif ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsServersPassword' -Value $SolarWindsServersPassword
  } else {
    $SolarWindsServersPassword = Read-RequiredSecret -Prompt 'SolarWinds servers password'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsNetworksUser)) {
  if (-not [string]::IsNullOrWhiteSpace($SolarWindsUser)) {
    $SolarWindsNetworksUser = $SolarWindsUser
  } elseif ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsNetworksUser' -Value $SolarWindsNetworksUser
  } else {
    $SolarWindsNetworksUser = Read-RequiredText -Prompt 'SolarWinds networks username'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsNetworksPassword)) {
  if (-not [string]::IsNullOrWhiteSpace($SolarWindsPassword)) {
    $SolarWindsNetworksPassword = $SolarWindsPassword
  } elseif ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsNetworksPassword' -Value $SolarWindsNetworksPassword
  } else {
    $SolarWindsNetworksPassword = Read-RequiredSecret -Prompt 'SolarWinds networks password'
  }
}

if ([string]::IsNullOrWhiteSpace($SymphonyUrl)) {
  if ($NonInteractive) {
    $SymphonyUrl = 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx'
  } else {
    $SymphonyUrl = Read-RequiredText -Prompt 'HSD dashboard URL' -Default 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx'
  }
}
if ([string]::IsNullOrWhiteSpace($SymphonyUser)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SymphonyUser' -Value $SymphonyUser
  } else {
    $SymphonyUser = Read-RequiredText -Prompt 'HSD username'
  }
}
if ([string]::IsNullOrWhiteSpace($SymphonyPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SymphonyPassword' -Value $SymphonyPassword
  } else {
    $SymphonyPassword = Read-RequiredSecret -Prompt 'HSD password'
  }
}

if (-not $PSBoundParameters.ContainsKey('SkipFirewallRule')) {
  if ($NonInteractive) {
    $SkipFirewallRule = $false
  } else {
    $SkipFirewallRule = -not (Read-YesNo -Prompt 'Create or refresh the operator/admin firewall rules?' -Default $true)
  }
}
if (-not $PSBoundParameters.ContainsKey('SkipStartStack')) {
  if ($NonInteractive) {
    $SkipStartStack = $false
  } else {
    $SkipStartStack = -not (Read-YesNo -Prompt 'Start the dashboard stack now?' -Default $true)
  }
}
if (-not $PSBoundParameters.ContainsKey('SkipAutostart')) {
  if ($NonInteractive) {
    $SkipAutostart = $false
  } else {
    $SkipAutostart = -not (Read-YesNo -Prompt 'Register automatic PM2 restore when this runtime user signs in?' -Default $true)
  }
}

$appAuthSecret = New-RandomHex -ByteCount 32
$appRoot = Join-Path $InstallRoot 'app'
$envPath = Join-Path $appRoot '.env'

$envLines = @(
  "NUTANIX_USER=$NutanixUser",
  "NUTANIX_PASS=$NutanixPassword",
  "NUTANIX_HOST=$NutanixHost",
  "NUTANIX_PORT=$NutanixPort",
  "SW_HOST_SERVERS=$SolarWindsServersHost",
  "SW_SERVERS_USER=$SolarWindsServersUser",
  "SW_SERVERS_PASS=$SolarWindsServersPassword",
  "SW_HOST_NETWORKS=$SolarWindsNetworksHost",
  "SW_NETWORKS_USER=$SolarWindsNetworksUser",
  "SW_NETWORKS_PASS=$SolarWindsNetworksPassword",
  "SYM_USER=$SymphonyUser",
  "SYM_PASS=$SymphonyPassword",
  "SYM_URL=$SymphonyUrl",
  "ITDASH_RUNTIME_ROOT=$RuntimeRoot",
  "SECRET_STORE_PASSPHRASE=$SecretStorePassphrase",
  "APP_AUTH_SECRET=$appAuthSecret",
  'APP_ADMIN_PASSWORD=17172737',
  'APP_OPERATOR_PASSWORD=17172737',
  'APP_LOGIN_PASSWORD=17172737',
  'VIEWER_SESSION_DAYS=365',
  'ADMIN_SESSION_HOURS=12',
  "OPERATOR_FRONTDOOR_PORT=$OperatorPort",
  "ADMIN_FRONTDOOR_PORT=$AdminPort"
)

Write-Host 'Deployment package root:' $resolvedPackageRoot
Write-Host 'Install root:' $InstallRoot
Write-Host 'Runtime root:' $RuntimeRoot
Write-Host 'Operator port:' $OperatorPort
Write-Host 'Admin port:' $AdminPort
Write-Host 'Non-interactive mode:' $NonInteractive
Write-Host 'Secret store enabled:' (-not [string]::IsNullOrWhiteSpace($SecretStorePassphrase))
Write-Host 'Nutanix host:' $NutanixHost
Write-Host 'SolarWinds servers host:' $SolarWindsServersHost
Write-Host 'SolarWinds networks host:' $SolarWindsNetworksHost
Write-Host 'SolarWinds servers username set:' (-not [string]::IsNullOrWhiteSpace($SolarWindsServersUser))
Write-Host 'SolarWinds networks username set:' (-not [string]::IsNullOrWhiteSpace($SolarWindsNetworksUser))
Write-Host 'HSD URL:' $SymphonyUrl
Write-Host 'HSD username set:' (-not [string]::IsNullOrWhiteSpace($SymphonyUser))
Write-Host 'Configure firewall rule:' (-not $SkipFirewallRule)
Write-Host 'Start stack:' (-not $SkipStartStack)
Write-Host 'Register autostart:' (-not $SkipAutostart)

if ($DryRun) {
  Write-Host '[dry-run] no files or services will be changed'
} else {
  [System.IO.Directory]::CreateDirectory($InstallRoot) | Out-Null
  [System.IO.Directory]::CreateDirectory($RuntimeRoot) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $RuntimeRoot 'sessions')) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $RuntimeRoot 'logs')) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $RuntimeRoot 'config')) | Out-Null
  [System.IO.Directory]::CreateDirectory((Join-Path $RuntimeRoot 'admin\reauth')) | Out-Null
}

Invoke-RobocopyCopy -Source (Join-Path $stageRoot 'app') -Destination (Join-Path $InstallRoot 'app')
Invoke-RobocopyCopy -Source (Join-Path $stageRoot 'runtime') -Destination (Join-Path $InstallRoot 'runtime')
Invoke-RobocopyCopy -Source (Join-Path $stageRoot 'runtime-tools') -Destination (Join-Path $InstallRoot 'runtime-tools')
Invoke-RobocopyCopy -Source (Join-Path $stageRoot 'metadata') -Destination (Join-Path $InstallRoot 'metadata')
Invoke-RobocopyCopy -Source $supportRoot -Destination (Join-Path $InstallRoot 'support')

if ($DryRun) {
  Write-Host "[dry-run] write $envPath"
} else {
  [System.IO.Directory]::CreateDirectory($appRoot) | Out-Null
  [System.IO.File]::WriteAllLines($envPath, $envLines)
}

Invoke-InstalledPowerShellScript -Name 'update-service-manifest.ps1' -Arguments @(
  '-InstallRoot', $InstallRoot,
  '-RuntimeRoot', $RuntimeRoot,
  '-OperatorPort', $OperatorPort.ToString(),
  '-AdminPort', $AdminPort.ToString()
)

if (-not $SkipFirewallRule) {
  Invoke-InstalledPowerShellScript -Name 'configure-firewall.ps1' -Arguments @(
    '-OperatorPort', $OperatorPort.ToString(),
    '-AdminPort', $AdminPort.ToString()
  )
}

if (-not $SkipStartStack) {
  Invoke-InstalledPowerShellScript -Name 'bootstrap-stack.ps1' -Arguments @(
    '-InstallRoot', $InstallRoot,
    '-RuntimeRoot', $RuntimeRoot
  )
}

if (-not $SkipAutostart) {
  Invoke-InstalledPowerShellScript -Name 'register-startup-task.ps1' -Arguments @(
    '-InstallRoot', $InstallRoot,
    '-RuntimeRoot', $RuntimeRoot
  )
}

Write-Host ''
Write-Host 'Deployment completed.'
Write-Host "Operator URL: http://<server>:$OperatorPort/login"
Write-Host "Admin URL:    http://<server>:$AdminPort/login"
