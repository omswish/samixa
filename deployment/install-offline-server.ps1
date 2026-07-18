param(
  [string]$BundleRoot = $PSScriptRoot,
  [string]$PostgresInstallRoot = 'C:\Program Files\UAIL\PostgreSQL\18',
  [string]$PostgresDataRoot = 'C:\ProgramData\UAIL\postgresql-18\data',
  [string]$PostgresServiceName = 'UAILPostgreSQL18',
  [int]$PostgresPort = 5432,
  [string]$PostgresSuperuser = 'postgres',
  [string]$PostgresPassword = '',
  [string]$SecretStorePassphrase = '',
  [string]$PostgresDatabase = 'hil-dor-itdash',
  [string]$PostgresSecretPassphrase = '',
  [string]$InstallRoot = 'C:\ProgramData\UAIL\ITDashboard',
  [string]$RuntimeRoot = '',
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
  [switch]$SkipPostgresInstall,
  [switch]$SkipVcRedist,
  [switch]$SkipFirewallRule,
  [switch]$SkipStartStack,
  [switch]$SkipAutostart,
  [switch]$NonInteractive,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($OperatorPort -lt 1 -or $OperatorPort -gt 65535) {
  throw 'OperatorPort must be between 1 and 65535.'
}

if ($AdminPort -lt 1 -or $AdminPort -gt 65535) {
  throw 'AdminPort must be between 1 and 65535.'
}

if ($OperatorPort -eq $AdminPort) {
  throw 'OperatorPort and AdminPort must be different.'
}

if ([string]::IsNullOrWhiteSpace($RuntimeRoot)) {
  $RuntimeRoot = $InstallRoot
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

function Assert-RequiredValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "$Name is required in non-interactive mode."
  }
}

if (-not $SkipPostgresInstall -and [string]::IsNullOrWhiteSpace($PostgresPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresPassword' -Value $PostgresPassword
  } else {
    $PostgresPassword = Read-RequiredSecret -Prompt 'PostgreSQL superuser password'
  }
}

if ([string]::IsNullOrWhiteSpace($SecretStorePassphrase) -and -not [string]::IsNullOrWhiteSpace($PostgresSecretPassphrase)) {
  $SecretStorePassphrase = $PostgresSecretPassphrase
}

if ([string]::IsNullOrWhiteSpace($SecretStorePassphrase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SecretStorePassphrase' -Value $SecretStorePassphrase
  } else {
    $SecretStorePassphrase = Read-RequiredSecret -Prompt 'Application secret-store passphrase'
  }
}

$resolvedBundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$postgresInstaller = Join-Path $resolvedBundleRoot 'postgres\support\install-postgres-offline.ps1'
$appProvisioner = Join-Path $resolvedBundleRoot 'installer\support\provision-staged-deployment.ps1'

foreach ($requiredScript in @($postgresInstaller, $appProvisioner)) {
  if (-not (Test-Path -LiteralPath $requiredScript)) {
    throw "Required bundle script not found: $requiredScript"
  }
}

Write-Host 'Offline bundle root:' $resolvedBundleRoot
Write-Host 'Dashboard install root:' $InstallRoot
Write-Host 'Dashboard runtime root:' $RuntimeRoot
Write-Host 'Operator port:' $OperatorPort
Write-Host 'Admin port:' $AdminPort
Write-Host 'Skip PostgreSQL install:' $SkipPostgresInstall
Write-Host 'Non-interactive mode:' $NonInteractive

if (-not $SkipPostgresInstall) {
  & $postgresInstaller `
    -BundleRoot $resolvedBundleRoot `
    -PostgresInstallRoot $PostgresInstallRoot `
    -PostgresDataRoot $PostgresDataRoot `
    -PostgresServiceName $PostgresServiceName `
    -PostgresPort $PostgresPort `
    -PostgresSuperuser $PostgresSuperuser `
    -PostgresPassword $PostgresPassword `
    -DatabaseName $PostgresDatabase `
    -SkipVcRedist:$SkipVcRedist `
    -NonInteractive:$NonInteractive `
    -DryRun:$DryRun
}

& $appProvisioner `
  -PackageRoot $resolvedBundleRoot `
  -InstallRoot $InstallRoot `
  -RuntimeRoot $RuntimeRoot `
  -InstallBundledPostgres:$false `
  -PostgresHost $(if ($SkipPostgresInstall) { '' } else { 'localhost' }) `
  -PostgresPort $PostgresPort `
  -PostgresDatabase $(if ($SkipPostgresInstall) { '' } else { $PostgresDatabase }) `
  -PostgresUser $(if ($SkipPostgresInstall) { '' } else { $PostgresSuperuser }) `
  -PostgresPassword $(if ($SkipPostgresInstall) { '' } else { $PostgresPassword }) `
  -SecretStorePassphrase $SecretStorePassphrase `
  -PostgresSsl $(if ($SkipPostgresInstall) { 'false' } else { 'false' }) `
  -NutanixHost $NutanixHost `
  -NutanixPort $NutanixPort `
  -NutanixUser $NutanixUser `
  -NutanixPassword $NutanixPassword `
  -SolarWindsServersHost $SolarWindsServersHost `
  -SolarWindsNetworksHost $SolarWindsNetworksHost `
  -SolarWindsUser $SolarWindsUser `
  -SolarWindsPassword $SolarWindsPassword `
  -SymphonyUrl $SymphonyUrl `
  -SymphonyUser $SymphonyUser `
  -SymphonyPassword $SymphonyPassword `
  -OperatorPort $OperatorPort `
  -AdminPort $AdminPort `
  -NonInteractive:$NonInteractive `
  -SkipFirewallRule:$SkipFirewallRule `
  -SkipStartStack:$SkipStartStack `
  -SkipAutostart:$SkipAutostart `
  -DryRun:$DryRun

Write-Host ''
Write-Host 'Offline server installation completed.'
Write-Host "Operator URL: http://<server>:$OperatorPort/login"
Write-Host "Admin URL:    http://<server>:$AdminPort/login"
