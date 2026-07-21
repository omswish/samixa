param(
  [string]$InstallRoot = 'C:\ProgramData\UAIL\ITDashboard',
  [string]$RuntimeRoot = 'C:\ProgramData\UAIL\ITDashboard',
  [string]$RuntimeUser,
  [switch]$SkipBootstrap,
  [switch]$SkipAutostart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
  throw 'This repair script must be run from an elevated PowerShell session.'
}

$resolvedRuntimeUser = if ([string]::IsNullOrWhiteSpace($RuntimeUser)) {
  "$([Environment]::UserDomainName)\$([Environment]::UserName)"
} else {
  $RuntimeUser
}

$supportRoot = Join-Path $PSScriptRoot '..\installer\support'
$repairPermissionsScript = Join-Path $supportRoot 'repair-runtime-permissions.ps1'
$bootstrapScript = Join-Path $supportRoot 'bootstrap-stack.ps1'
$registerTaskScript = Join-Path $supportRoot 'register-startup-task.ps1'

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $repairPermissionsScript `
  -InstallRoot $InstallRoot `
  -RuntimeRoot $RuntimeRoot `
  -RuntimeUser $resolvedRuntimeUser
if ($LASTEXITCODE -ne 0) {
  throw "Runtime permission repair failed with exit code $LASTEXITCODE"
}

if (-not $SkipBootstrap) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $bootstrapScript `
    -InstallRoot $InstallRoot `
    -RuntimeRoot $RuntimeRoot `
    -RuntimeUser $resolvedRuntimeUser
  if ($LASTEXITCODE -ne 0) {
    throw "Bootstrap repair failed with exit code $LASTEXITCODE"
  }
}

if (-not $SkipAutostart) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $registerTaskScript `
    -InstallRoot $InstallRoot `
    -RuntimeRoot $RuntimeRoot `
    -RuntimeUser $resolvedRuntimeUser
  if ($LASTEXITCODE -ne 0) {
    throw "Autostart repair failed with exit code $LASTEXITCODE"
  }
}

Write-Output "Installed runtime repaired successfully for $resolvedRuntimeUser"
