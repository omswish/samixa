param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '..\..'),
  [string]$InstallRoot = 'C:\ProgramData\UAIL\ITDashboard',
  [string]$RuntimeRoot = '',
  [switch]$InstallBundledPostgres,
  [string]$PostgresInstallRoot = 'C:\Program Files\UAIL\PostgreSQL\18',
  [string]$PostgresDataRoot = 'C:\ProgramData\UAIL\postgresql-18\data',
  [string]$PostgresServiceName = 'UAILPostgreSQL18',
  [string]$PostgresHost = '',
  [int]$PostgresPort = 5432,
  [string]$PostgresDatabase = '',
  [string]$PostgresUser = '',
  [string]$PostgresPassword = '',
  [string]$SecretStorePassphrase = '',
  [string]$PostgresSecretPassphrase = '',
  [ValidateSet('false', 'true')]
  [string]$PostgresSsl = 'false',
  [string]$NutanixHost = '',
  [int]$NutanixPort = 9440,
  [string]$NutanixUser = '',
  [string]$NutanixPassword = '',
  [string]$SolarWindsServersHost = '',
  [string]$SolarWindsNetworksHost = '',
  [string]$SolarWindsUser = '',
  [string]$SolarWindsPassword = '',
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

function Get-UrlEncoded {
  param(
    [Parameter(Mandatory = $true)][string]$Value
  )

  return [Uri]::EscapeDataString($Value)
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

function Invoke-PostgresValidation {
  $nodeExe = Join-Path $InstallRoot 'runtime\node\node.exe'
  $scriptPath = Join-Path $InstallRoot 'support\validate-postgres.js'
  $appRoot = Join-Path $InstallRoot 'app'

  if ($DryRun) {
    Write-Host "[dry-run] $nodeExe $scriptPath $appRoot"
    return
  }

  & $nodeExe $scriptPath $appRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Postgres validation failed with exit code $LASTEXITCODE"
  }
}

function Get-TrimmedOrDefault {
  param(
    [string]$Value,
    [string]$Default = ''
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Default
  }

  return $Value.Trim()
}

$resolvedPackageRoot = [System.IO.Path]::GetFullPath($PackageRoot)
$stageRoot = Join-Path $resolvedPackageRoot 'staging\current'
$supportRoot = Join-Path $resolvedPackageRoot 'installer\support'
$postgresRuntimeRoot = Join-Path $stageRoot 'postgres\runtime'
$postgresInstallerScript = Join-Path $resolvedPackageRoot 'postgres\support\install-postgres-offline.ps1'

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

$bundledPostgresAvailable =
  (Test-Path -LiteralPath $postgresInstallerScript) -and
  (Test-Path -LiteralPath (Join-Path $postgresRuntimeRoot 'bin')) -and
  (Test-Path -LiteralPath (Join-Path $postgresRuntimeRoot 'lib')) -and
  (Test-Path -LiteralPath (Join-Path $postgresRuntimeRoot 'share')) -and
  (Test-Path -LiteralPath (Join-Path $postgresRuntimeRoot 'installer'))

if (-not $PSBoundParameters.ContainsKey('InstallBundledPostgres')) {
  if ($NonInteractive) {
    $InstallBundledPostgres = $false
  } elseif ($bundledPostgresAvailable) {
    $InstallBundledPostgres = Read-YesNo -Prompt 'Install the bundled PostgreSQL server locally on this machine?' -Default $true
  } else {
    $InstallBundledPostgres = $false
  }
}

if ($InstallBundledPostgres -and -not $bundledPostgresAvailable) {
  throw 'Bundled PostgreSQL install was requested, but the staged PostgreSQL payload is missing.'
}

$postgresSettingsProvided =
  -not [string]::IsNullOrWhiteSpace($PostgresHost) -or
  -not [string]::IsNullOrWhiteSpace($PostgresDatabase) -or
  -not [string]::IsNullOrWhiteSpace($PostgresUser) -or
  -not [string]::IsNullOrWhiteSpace($PostgresPassword)

$UseExternalPostgres = $false
if (-not $InstallBundledPostgres) {
  if ($NonInteractive) {
    $UseExternalPostgres = $postgresSettingsProvided
  } else {
    $UseExternalPostgres = Read-YesNo -Prompt 'Use an external PostgreSQL mirror/config database?' -Default $false
  }
}

$usePostgres = $InstallBundledPostgres -or $UseExternalPostgres

if ($usePostgres -and [string]::IsNullOrWhiteSpace($PostgresHost)) {
  if ($InstallBundledPostgres) {
    $PostgresHost = 'localhost'
  } elseif ($NonInteractive) {
    $PostgresHost = 'localhost'
  } else {
    $PostgresHost = Read-RequiredText -Prompt 'Postgres host' -Default 'localhost'
  }
}
if ($usePostgres -and [string]::IsNullOrWhiteSpace($PostgresDatabase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresDatabase' -Value $PostgresDatabase
  } else {
    $PostgresDatabase = Read-RequiredText -Prompt 'Postgres database name' -Default 'hil-dor-itdash'
  }
}
if ($usePostgres -and [string]::IsNullOrWhiteSpace($PostgresUser)) {
  if ($InstallBundledPostgres) {
    $PostgresUser = 'postgres'
  } elseif ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresUser' -Value $PostgresUser
  } else {
    $PostgresUser = Read-RequiredText -Prompt 'Postgres user' -Default 'postgres'
  }
}
if ($usePostgres -and [string]::IsNullOrWhiteSpace($PostgresPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresPassword' -Value $PostgresPassword
  } else {
    $PostgresPassword = Read-RequiredSecret -Prompt 'Postgres password'
  }
}
if ([string]::IsNullOrWhiteSpace($SecretStorePassphrase) -and -not [string]::IsNullOrWhiteSpace($PostgresSecretPassphrase)) {
  $SecretStorePassphrase = $PostgresSecretPassphrase
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
if ([string]::IsNullOrWhiteSpace($SolarWindsUser)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsUser' -Value $SolarWindsUser
  } else {
    $SolarWindsUser = Read-RequiredText -Prompt 'SolarWinds/HSD username'
  }
}
if ([string]::IsNullOrWhiteSpace($SolarWindsPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SolarWindsPassword' -Value $SolarWindsPassword
  } else {
    $SolarWindsPassword = Read-RequiredSecret -Prompt 'SolarWinds/HSD password'
  }
}

if ([string]::IsNullOrWhiteSpace($SymphonyUrl)) {
  if ($NonInteractive) {
    $SymphonyUrl = 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx'
  } else {
    $SymphonyUrl = Read-RequiredText -Prompt 'HSD dashboard URL' -Default 'https://hsd.adityabirla.com/MDLIncidentMgmt/SDE_Dashboard.aspx'
  }
}
$SymphonyUser = Get-TrimmedOrDefault -Value $SymphonyUser -Default $SolarWindsUser
$SymphonyPassword = Get-TrimmedOrDefault -Value $SymphonyPassword -Default $SolarWindsPassword

if ([string]::IsNullOrWhiteSpace($SymphonyUser)) {
  throw 'SymphonyUser could not be resolved. Provide SolarWinds/HSD credentials.'
}

if ([string]::IsNullOrWhiteSpace($SymphonyPassword)) {
  throw 'SymphonyPassword could not be resolved. Provide SolarWinds/HSD credentials.'
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
    $SkipAutostart = -not (Read-YesNo -Prompt 'Register automatic PM2 restore at system startup?' -Default $true)
  }
}

if ($InstallBundledPostgres) {
  $PostgresHost = 'localhost'
  $PostgresUser = 'postgres'
  $PostgresSsl = 'false'
}

$postgresConfigured =
  -not [string]::IsNullOrWhiteSpace($PostgresHost) -and
  -not [string]::IsNullOrWhiteSpace($PostgresDatabase) -and
  -not [string]::IsNullOrWhiteSpace($PostgresUser) -and
  -not [string]::IsNullOrWhiteSpace($PostgresPassword)

$postgresUrl = if ($postgresConfigured) {
  'postgresql://{0}:{1}@{2}:{3}/{4}' -f `
    (Get-UrlEncoded -Value $PostgresUser), `
    (Get-UrlEncoded -Value $PostgresPassword), `
    $PostgresHost.Trim(), `
    $PostgresPort, `
    (Get-UrlEncoded -Value $PostgresDatabase)
} else {
  $null
}

$appAuthSecret = New-RandomHex -ByteCount 32
$appRoot = Join-Path $InstallRoot 'app'
$envPath = Join-Path $appRoot '.env'

$envLines = @(
  "NUTANIX_USER=$NutanixUser",
  "NUTANIX_PASS=$NutanixPassword",
  "NUTANIX_HOST=$NutanixHost",
  "NUTANIX_PORT=$NutanixPort",
  "SW_USER=$SolarWindsUser",
  "SW_PASS=$SolarWindsPassword",
  "SW_HOST_SERVERS=$SolarWindsServersHost",
  "SW_HOST_NETWORKS=$SolarWindsNetworksHost",
  "SYM_USER=$SymphonyUser",
  "SYM_PASS=$SymphonyPassword",
  "SYM_URL=$SymphonyUrl",
  "ITDASH_RUNTIME_ROOT=$RuntimeRoot",
  "SECRET_STORE_PASSPHRASE=$SecretStorePassphrase",
  "POSTGRES_SECRET_PASSPHRASE=$SecretStorePassphrase",
  "APP_AUTH_SECRET=$appAuthSecret",
  'APP_LOGIN_PASSWORD=17172737',
  'VIEWER_SESSION_DAYS=365',
  'ADMIN_SESSION_HOURS=12',
  "OPERATOR_FRONTDOOR_PORT=$OperatorPort",
  "ADMIN_FRONTDOOR_PORT=$AdminPort"
)

if ($postgresConfigured) {
  $envLines += "POSTGRES_URL=$postgresUrl"
  $envLines += "POSTGRES_SSL=$PostgresSsl"
}

Write-Host 'Deployment package root:' $resolvedPackageRoot
Write-Host 'Install root:' $InstallRoot
Write-Host 'Runtime root:' $RuntimeRoot
Write-Host 'Install bundled PostgreSQL:' $InstallBundledPostgres
Write-Host 'Operator port:' $OperatorPort
Write-Host 'Admin port:' $AdminPort
Write-Host 'Non-interactive mode:' $NonInteractive
Write-Host 'Postgres host:' $PostgresHost
Write-Host 'Postgres database:' $PostgresDatabase
Write-Host 'Postgres user:' $PostgresUser
Write-Host 'Postgres enabled:' $postgresConfigured
Write-Host 'Postgres SSL:' $PostgresSsl
Write-Host 'Secret store enabled:' (-not [string]::IsNullOrWhiteSpace($SecretStorePassphrase))
Write-Host 'Nutanix host:' $NutanixHost
Write-Host 'SolarWinds servers host:' $SolarWindsServersHost
Write-Host 'SolarWinds networks host:' $SolarWindsNetworksHost
Write-Host 'HSD URL:' $SymphonyUrl
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
}

if ($InstallBundledPostgres) {
  Invoke-PowerShellScriptChecked -ScriptPath $postgresInstallerScript -Arguments @(
    '-BundleRoot', $stageRoot,
    '-PostgresInstallRoot', $PostgresInstallRoot,
    '-PostgresDataRoot', $PostgresDataRoot,
    '-PostgresServiceName', $PostgresServiceName,
    '-PostgresPort', $PostgresPort.ToString(),
    '-PostgresSuperuser', $PostgresUser,
    '-PostgresPassword', $PostgresPassword,
    '-DatabaseName', $PostgresDatabase,
    '-NonInteractive:' + $NonInteractive.ToString().ToLowerInvariant(),
    '-DryRun:' + $DryRun.ToString().ToLowerInvariant()
  )
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
  '-OperatorPort', $OperatorPort.ToString(),
  '-AdminPort', $AdminPort.ToString()
)
if ($postgresConfigured) {
  Invoke-PostgresValidation
}

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
