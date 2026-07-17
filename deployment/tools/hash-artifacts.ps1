param(
  [string]$InstallerOutputDir = (Join-Path $PSScriptRoot '..\installer\output'),
  [string]$ReleaseDir = (Join-Path $PSScriptRoot '..\release'),
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\release\artifact-hashes-2026-07-17.md')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedInstallerOutputDir = [System.IO.Path]::GetFullPath($InstallerOutputDir)
$resolvedReleaseDir = [System.IO.Path]::GetFullPath($ReleaseDir)
$resolvedOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($resolvedOutputPath)) | Out-Null

$artifactFiles = @()
$artifactRoots = @(
  @{ Root = $resolvedInstallerOutputDir; Label = 'installer' },
  @{ Root = $resolvedReleaseDir; Label = 'release' }
)

foreach ($artifactRoot in $artifactRoots) {
  if (-not (Test-Path -LiteralPath $artifactRoot.Root)) {
    continue
  }

  $artifactFiles += Get-ChildItem -Path $artifactRoot.Root -File -Recurse |
    Where-Object { $_.Extension -in '.exe', '.zip' } |
    ForEach-Object {
      [PSCustomObject]@{
        FullName = $_.FullName
        Length = $_.Length
        Root = $artifactRoot.Root
        Label = $artifactRoot.Label
      }
    }
}

$lines = @(
  '# Release Artifact Hashes - 2026-07-17',
  '',
  '| File | SHA256 | Size |',
  '| --- | --- | --- |'
)

foreach ($file in $artifactFiles) {
  $hash = Get-FileHash -Path $file.FullName -Algorithm SHA256
  $relativePath = $file.FullName.Substring($file.Root.Length).TrimStart('\')
  $displayPath = Join-Path $file.Label $relativePath
  $lines += "| $displayPath | $($hash.Hash) | $($file.Length) |"
}

if ($artifactFiles.Count -eq 0) {
  $lines += '| _none_ | _no packaged artifacts found_ | 0 |'
}

Set-Content -Path $resolvedOutputPath -Value $lines -Encoding UTF8
Write-Output "Wrote $resolvedOutputPath"
