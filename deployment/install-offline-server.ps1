param(
  [string]$BundleRoot = $PSScriptRoot,
  [string]$SecretStorePassphrase = '',
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
  [string]$SolarWindsServersUser = '',
  [string]$SolarWindsServersPassword = '',
  [string]$SolarWindsNetworksUser = '',
  [string]$SolarWindsNetworksPassword = '',
  [string]$SymphonyUrl = '',
  [string]$SymphonyUser = '',
  [string]$SymphonyPassword = '',
  [string]$AdminLoginId = 'admin',
  [string]$OperatorLoginId = 'operator',
  [int]$OperatorPort = 21060,
  [int]$AdminPort = 21061,
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

$InstallRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$RuntimeRoot = [System.IO.Path]::GetFullPath($RuntimeRoot)

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

if ([string]::IsNullOrWhiteSpace($SecretStorePassphrase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'SecretStorePassphrase' -Value $SecretStorePassphrase
  } else {
    $SecretStorePassphrase = Read-RequiredSecret -Prompt 'Application secret-store passphrase'
  }
}

$resolvedBundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$appProvisioner = Join-Path $resolvedBundleRoot 'installer\support\provision-staged-deployment.ps1'

if (-not (Test-Path -LiteralPath $appProvisioner)) {
  throw "Required bundle script not found: $appProvisioner"
}

Write-Host 'Offline bundle root:' $resolvedBundleRoot
Write-Host 'Dashboard install root:' $InstallRoot
Write-Host 'Dashboard runtime root:' $RuntimeRoot
Write-Host 'Operator port:' $OperatorPort
Write-Host 'Admin port:' $AdminPort
Write-Host 'Non-interactive mode:' $NonInteractive

& $appProvisioner `
  -PackageRoot $resolvedBundleRoot `
  -InstallRoot $InstallRoot `
  -RuntimeRoot $RuntimeRoot `
  -SecretStorePassphrase $SecretStorePassphrase `
  -NutanixHost $NutanixHost `
  -NutanixPort $NutanixPort `
  -NutanixUser $NutanixUser `
  -NutanixPassword $NutanixPassword `
  -SolarWindsServersHost $SolarWindsServersHost `
  -SolarWindsNetworksHost $SolarWindsNetworksHost `
  -SolarWindsUser $SolarWindsUser `
  -SolarWindsPassword $SolarWindsPassword `
  -SolarWindsServersUser $SolarWindsServersUser `
  -SolarWindsServersPassword $SolarWindsServersPassword `
  -SolarWindsNetworksUser $SolarWindsNetworksUser `
  -SolarWindsNetworksPassword $SolarWindsNetworksPassword `
  -SymphonyUrl $SymphonyUrl `
  -SymphonyUser $SymphonyUser `
  -SymphonyPassword $SymphonyPassword `
  -AdminLoginId $AdminLoginId `
  -OperatorLoginId $OperatorLoginId `
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
