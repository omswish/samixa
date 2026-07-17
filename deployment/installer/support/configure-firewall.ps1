param(
  [Parameter(Mandatory = $true)][int]$OperatorPort,
  [Parameter(Mandatory = $true)][int]$AdminPort
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($rule in @(
  @{ Name = "UAIL IT Dashboard Operator ($OperatorPort)"; Port = $OperatorPort },
  @{ Name = "UAIL IT Dashboard Admin ($AdminPort)"; Port = $AdminPort }
)) {
  $existingRules = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if ($existingRules) {
    $existingRules | Remove-NetFirewallRule | Out-Null
  }

  New-NetFirewallRule `
    -DisplayName $rule.Name `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $rule.Port `
    -Profile Domain,Private | Out-Null
}

Write-Output "Configured firewall rules for operator port $OperatorPort and admin port $AdminPort"
