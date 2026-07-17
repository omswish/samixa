param(
  [string]$BundleRoot = (Join-Path $PSScriptRoot '..\..'),
  [string]$PostgresInstallRoot = 'C:\Program Files\UAIL\PostgreSQL\18',
  [string]$PostgresDataRoot = 'C:\ProgramData\UAIL\postgresql-18\data',
  [string]$PostgresServiceName = 'UAILPostgreSQL18',
  [int]$PostgresPort = 5432,
  [string]$PostgresSuperuser = 'postgres',
  [string]$PostgresPassword = '',
  [string]$DatabaseName = 'hil-dor-itdash',
  [switch]$SkipVcRedist,
  [switch]$SkipServiceStart,
  [switch]$NonInteractive,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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

function Invoke-ProcessChecked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @()
  )

  if ($DryRun) {
    Write-Host "[dry-run] $FilePath $($ArgumentList -join ' ')"
    return
  }

  $proc = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru -NoNewWindow
  if ($proc.ExitCode -ne 0) {
    throw "Command failed: $FilePath $($ArgumentList -join ' ') (exit code $($proc.ExitCode))"
  }
}

function Get-ServiceByName {
  param(
    [Parameter(Mandatory = $true)][string]$Name
  )

  return Get-Service -Name $Name -ErrorAction SilentlyContinue
}

function Ensure-PostgresConfigLine {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Replacement
  )

  if ($DryRun) {
    Write-Host ("[dry-run] set config in {0}: {1}" -f $Path, $Replacement)
    return
  }

  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match $Pattern) {
    $updated = [Regex]::Replace($content, $Pattern, $Replacement, [System.Text.RegularExpressions.RegexOptions]::Multiline)
  } else {
    $updated = $content.TrimEnd() + [Environment]::NewLine + $Replacement + [Environment]::NewLine
  }
  Set-Content -LiteralPath $Path -Value $updated -Encoding UTF8
}

if ([string]::IsNullOrWhiteSpace($PostgresPassword)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'PostgresPassword' -Value $PostgresPassword
  } else {
    $PostgresPassword = Read-RequiredSecret -Prompt 'PostgreSQL superuser password'
  }
}

if ([string]::IsNullOrWhiteSpace($DatabaseName)) {
  if ($NonInteractive) {
    Assert-RequiredValue -Name 'DatabaseName' -Value $DatabaseName
  } else {
    $DatabaseName = Read-RequiredText -Prompt 'Application database name' -Default 'hil-dor-itdash'
  }
}

$resolvedBundleRoot = [System.IO.Path]::GetFullPath($BundleRoot)
$postgresRuntimeRoot = Join-Path $resolvedBundleRoot 'postgres\runtime'

foreach ($requiredPath in @(
  (Join-Path $postgresRuntimeRoot 'bin'),
  (Join-Path $postgresRuntimeRoot 'lib'),
  (Join-Path $postgresRuntimeRoot 'share'),
  (Join-Path $postgresRuntimeRoot 'installer')
)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required PostgreSQL bundle path not found: $requiredPath"
  }
}

$bundleBin = Join-Path $postgresRuntimeRoot 'bin'
$bundleInstaller = Join-Path $postgresRuntimeRoot 'installer'
$targetBin = Join-Path $PostgresInstallRoot 'bin'
$initdbExe = Join-Path $targetBin 'initdb.exe'
$pgCtlExe = Join-Path $targetBin 'pg_ctl.exe'
$psqlExe = Join-Path $targetBin 'psql.exe'
$createdbExe = Join-Path $targetBin 'createdb.exe'
$pgIsReadyExe = Join-Path $targetBin 'pg_isready.exe'
$configFile = Join-Path $PostgresDataRoot 'postgresql.conf'
$pgVersionFile = Join-Path $PostgresDataRoot 'PG_VERSION'
$pwFile = Join-Path $env:TEMP ('uail-postgres-pw-' + [guid]::NewGuid().ToString('N') + '.txt')
$vcredistX64 = Join-Path $bundleInstaller 'vcredist_x64.exe'

Write-Host 'PostgreSQL bundle root:' $resolvedBundleRoot
Write-Host 'PostgreSQL install root:' $PostgresInstallRoot
Write-Host 'PostgreSQL data root:' $PostgresDataRoot
Write-Host 'PostgreSQL service name:' $PostgresServiceName
Write-Host 'PostgreSQL port:' $PostgresPort
Write-Host 'Database name:' $DatabaseName
Write-Host 'Skip VC++ runtime install:' $SkipVcRedist
Write-Host 'Skip service start:' $SkipServiceStart
Write-Host 'Non-interactive mode:' $NonInteractive

Invoke-RobocopyCopy -Source (Join-Path $postgresRuntimeRoot 'bin') -Destination (Join-Path $PostgresInstallRoot 'bin')
Invoke-RobocopyCopy -Source (Join-Path $postgresRuntimeRoot 'lib') -Destination (Join-Path $PostgresInstallRoot 'lib')
Invoke-RobocopyCopy -Source (Join-Path $postgresRuntimeRoot 'share') -Destination (Join-Path $PostgresInstallRoot 'share')
Invoke-RobocopyCopy -Source (Join-Path $postgresRuntimeRoot 'installer') -Destination (Join-Path $PostgresInstallRoot 'installer')

if (Test-Path -LiteralPath (Join-Path $postgresRuntimeRoot 'scripts')) {
  Invoke-RobocopyCopy -Source (Join-Path $postgresRuntimeRoot 'scripts') -Destination (Join-Path $PostgresInstallRoot 'scripts')
}

foreach ($fileName in @(
  'pg_env.bat',
  'server_license.txt',
  'commandlinetools_3rd_party_licenses.txt',
  'StackBuilder_3rd_party_licenses.txt'
)) {
  $sourceFile = Join-Path $postgresRuntimeRoot $fileName
  if (-not (Test-Path -LiteralPath $sourceFile)) {
    continue
  }

  if ($DryRun) {
    Write-Host "[dry-run] copy $sourceFile -> $PostgresInstallRoot"
  } else {
    [System.IO.Directory]::CreateDirectory($PostgresInstallRoot) | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $PostgresInstallRoot $fileName) -Force
  }
}

if (-not $SkipVcRedist -and (Test-Path -LiteralPath $vcredistX64)) {
  Invoke-ProcessChecked -FilePath $vcredistX64 -ArgumentList @('/install', '/quiet', '/norestart')
}

if ($DryRun) {
  Write-Host "[dry-run] ensure data directory $PostgresDataRoot"
} else {
  [System.IO.Directory]::CreateDirectory($PostgresDataRoot) | Out-Null
}

if (-not (Test-Path -LiteralPath $pgVersionFile)) {
  if ($DryRun) {
    Write-Host "[dry-run] initialize PostgreSQL cluster at $PostgresDataRoot"
  } else {
    Set-Content -LiteralPath $pwFile -Value $PostgresPassword -Encoding ASCII
    try {
      Invoke-ProcessChecked -FilePath $initdbExe -ArgumentList @(
        '-D', $PostgresDataRoot,
        '-U', $PostgresSuperuser,
        '--pwfile', $pwFile,
        '--auth-host=scram-sha-256',
        '--auth-local=trust',
        '--encoding=UTF8'
      )
    } finally {
      Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue
    }
  }
}

if ((Test-Path -LiteralPath $configFile) -or $DryRun) {
  Ensure-PostgresConfigLine -Path $configFile -Pattern '^[#\s]*port\s*=.*$' -Replacement ("port = {0}" -f $PostgresPort)
  Ensure-PostgresConfigLine -Path $configFile -Pattern "^[#\s]*listen_addresses\s*=.*$" -Replacement "listen_addresses = 'localhost'"
}

$existingService = Get-ServiceByName -Name $PostgresServiceName
if (-not $existingService) {
  Invoke-ProcessChecked -FilePath $pgCtlExe -ArgumentList @(
    'register',
    '-N', $PostgresServiceName,
    '-D', $PostgresDataRoot,
    '-S', 'auto',
    '-o', ('-p {0}' -f $PostgresPort)
  )
}

if (-not $SkipServiceStart) {
  if ($DryRun) {
    Write-Host "[dry-run] start service $PostgresServiceName"
  } else {
    $service = Get-ServiceByName -Name $PostgresServiceName
    if (-not $service) {
      throw "Service $PostgresServiceName was not registered successfully."
    }
    if ($service.Status -ne 'Running') {
      Start-Service -Name $PostgresServiceName
      $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      $result = & $pgIsReadyExe -h localhost -p $PostgresPort -d postgres
      if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
      }
      Start-Sleep -Seconds 2
    }
    if (-not $ready) {
      throw "PostgreSQL did not become ready on localhost:$PostgresPort"
    }
  }
}

if ($DryRun) {
  Write-Host "[dry-run] ensure database $DatabaseName exists"
} else {
  $env:PGPASSWORD = $PostgresPassword
  try {
    $databaseExists = & $psqlExe -h localhost -p $PostgresPort -U $PostgresSuperuser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to query existing PostgreSQL databases."
    }

    if (($databaseExists | Out-String).Trim() -ne '1') {
      Invoke-ProcessChecked -FilePath $createdbExe -ArgumentList @(
        '-h', 'localhost',
        '-p', $PostgresPort,
        '-U', $PostgresSuperuser,
        $DatabaseName
      )
    }
  } finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

Write-Host ''
Write-Host 'PostgreSQL offline installation completed.'
Write-Host "Service: $PostgresServiceName"
Write-Host "Data root: $PostgresDataRoot"
Write-Host "Database: $DatabaseName"
