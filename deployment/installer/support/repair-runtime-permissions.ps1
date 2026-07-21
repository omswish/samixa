param(
  [Parameter(Mandatory = $true)][string]$InstallRoot,
  [Parameter(Mandatory = $true)][string]$RuntimeRoot,
  [string]$RuntimeUser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RuntimeUser {
  param([string]$Candidate)

  if (-not [string]::IsNullOrWhiteSpace($Candidate)) {
    return $Candidate
  }

  $domain = [Environment]::UserDomainName
  $user = [Environment]::UserName
  if ([string]::IsNullOrWhiteSpace($domain) -or [string]::IsNullOrWhiteSpace($user)) {
    throw 'Unable to resolve the runtime user automatically.'
  }

  return "$domain\$user"
}

function Ensure-Directory {
  param([Parameter(Mandatory = $true)][string]$Path)

  [System.IO.Directory]::CreateDirectory($Path) | Out-Null
}

function Grant-RecursiveAccess {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Identity,
    [Parameter(Mandatory = $true)][string]$Rights
  )

  & icacls.exe $Path /inheritance:e /grant:r "${Identity}:(OI)(CI)$Rights" /T /C | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to grant $Rights access to $Identity on $Path"
  }
}

$resolvedRuntimeUser = Resolve-RuntimeUser -Candidate $RuntimeUser
$appRoot = Join-Path $InstallRoot 'app'

$pathsToPrepare = @(
  (Join-Path $RuntimeRoot 'pm2'),
  (Join-Path $RuntimeRoot 'logs'),
  (Join-Path $RuntimeRoot 'sessions'),
  (Join-Path $RuntimeRoot 'config'),
  (Join-Path $RuntimeRoot 'admin\reauth'),
  (Join-Path $appRoot 'data')
)

foreach ($path in $pathsToPrepare) {
  Ensure-Directory -Path $path
}

foreach ($path in $pathsToPrepare) {
  Grant-RecursiveAccess -Path $path -Identity 'SYSTEM' -Rights 'F'
  Grant-RecursiveAccess -Path $path -Identity 'Administrators' -Rights 'F'
  Grant-RecursiveAccess -Path $path -Identity $resolvedRuntimeUser -Rights 'M'
}

Write-Output "Repaired runtime permissions for $resolvedRuntimeUser"
