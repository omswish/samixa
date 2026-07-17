param(
  [string]$PackageRoot = (Join-Path $PSScriptRoot '..\..'),
  [string]$InstallRoot = 'C:\Program Files\UAIL\ITDashboard',
  [string]$RuntimeRoot = 'C:\ProgramData\UAIL\itdash',
  [string]$PostgresHost = '',
  [int]$PostgresPort = 5432,
  [string]$PostgresDatabase = '',
  [string]$PostgresUser = '',
  [string]$PostgresPassword = '',
  [string]$PostgresSecretPassphrase = '',
  [ValidateSet('false', 'true')]
  [string]$PostgresSsl = 'false',
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

function Invoke-InstalledPowerShellScript {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string[]]$Arguments = @()
  )

  $scriptPath = Join-Path $InstallRoot "support\$Name"
  if ($DryRun) {
    Write-Host "[dry-run] powershell -File $scriptPath $($Arguments -join ' ')"
    return
  }

  if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Installed support script not found: $scriptPath"
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Support script failed: $Name (exit code $LASTEXITCODE)"
  }
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

if ([string]::IsNullOrWhiteSpace($PostgresHost)) {
  if ($NonInteractive) {
    $PostgresHost = 'localhost'
  } else {
    $PostgresHost = Read-RequiredText -Prompt 'Postgres host' -Default 'localhost'
  }
}
if ([string]::IsNullOrWhiteSpace($PostgresDatabase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresDatabase' -Value $PostgresDatabase
  } else {
    $PostgresDatabase = Read-RequiredText -Prompt 'Postgres database name'
  }
}
if ([string]::IsNullOrWhiteSpace($PostgresUser)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresUser' -Value $PostgresUser
  } else {
    $PostgresUser = Read-RequiredText -Prompt 'Postgres user'
  }
}
if ([string]::IsNullOrWhiteSpace($PostgresPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresPassword' -Value $PostgresPassword
  } else {
    $PostgresPassword = Read-RequiredSecret -Prompt 'Postgres password'
  }
}
if ([string]::IsNullOrWhiteSpace($PostgresSecretPassphrase)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresSecretPassphrase' -Value $PostgresSecretPassphrase
  } else {
    $PostgresSecretPassphrase = Read-RequiredSecret -Prompt 'Secret-store passphrase'
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
    $SkipAutostart = -not (Read-YesNo -Prompt 'Register automatic PM2 restore at system startup?' -Default $true)
  }
}

$postgresUrl = 'postgresql://{0}:{1}@{2}:{3}/{4}' -f `
  (Get-UrlEncoded -Value $PostgresUser), `
  (Get-UrlEncoded -Value $PostgresPassword), `
  $PostgresHost.Trim(), `
  $PostgresPort, `
  (Get-UrlEncoded -Value $PostgresDatabase)

$appAuthSecret = New-RandomHex -ByteCount 32
$appRoot = Join-Path $InstallRoot 'app'
$envPath = Join-Path $appRoot '.env'

$envLines = @(
  "POSTGRES_URL=$postgresUrl",
  "POSTGRES_SSL=$PostgresSsl",
  "POSTGRES_SECRET_PASSPHRASE=$PostgresSecretPassphrase",
  "APP_AUTH_SECRET=$appAuthSecret",
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
Write-Host 'Postgres host:' $PostgresHost
Write-Host 'Postgres database:' $PostgresDatabase
Write-Host 'Postgres user:' $PostgresUser
Write-Host 'Postgres SSL:' $PostgresSsl
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
Invoke-PostgresValidation

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
