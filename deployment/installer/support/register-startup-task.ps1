param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [string]$RuntimeUser,
  [string]$TaskName = 'UAIL IT Dashboard'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$supportScript = Join-Path $InstallRoot 'support\pm2-resurrect.ps1'
$permissionRepairScript = @(
  (Join-Path $InstallRoot 'support\repair-runtime-permissions.ps1'),
  (Join-Path $PSScriptRoot 'repair-runtime-permissions.ps1')
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$resolvedRuntimeUser = if ([string]::IsNullOrWhiteSpace($RuntimeUser)) {
  "$([Environment]::UserDomainName)\$([Environment]::UserName)"
} else {
  $RuntimeUser
}

if (-not (Test-Path -LiteralPath $supportScript)) {
  throw "Startup task prerequisite missing: pm2 resurrect script ($supportScript)"
}

if (-not $permissionRepairScript) {
  throw 'Startup task prerequisite missing: runtime permission repair helper'
}

$bootstrapArgumentList = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', ('"' + $supportScript + '"'),
  '-InstallRoot', ('"' + $InstallRoot + '"'),
  '-RuntimeRoot', ('"' + $RuntimeRoot + '"')
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $bootstrapArgumentList
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $resolvedRuntimeUser
$principal = New-ScheduledTaskPrincipal -UserId $resolvedRuntimeUser -RunLevel Highest -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null

& powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $permissionRepairScript `
  -InstallRoot $InstallRoot `
  -RuntimeRoot $RuntimeRoot `
  -RuntimeUser $resolvedRuntimeUser
if ($LASTEXITCODE -ne 0) {
  throw "Runtime permission repair failed with exit code $LASTEXITCODE"
}

Write-Output "Registered scheduled task $TaskName for $resolvedRuntimeUser"
