param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [string]$TaskName = 'UAIL IT Dashboard'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$supportScript = Join-Path $InstallRoot 'support\pm2-resurrect.ps1'
$argumentList = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-WindowStyle', 'Hidden',
  '-File', ('"' + $supportScript + '"'),
  '-InstallRoot', ('"' + $InstallRoot + '"'),
  '-RuntimeRoot', ('"' + $RuntimeRoot + '"')
) -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentList
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

Write-Output "Registered scheduled task $TaskName"
