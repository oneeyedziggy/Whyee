<#
.SYNOPSIS
  Forwards the Expo/Metro dev server port from Windows to the current WSL2 instance
  so phones on the LAN can reach Expo Go running against WSL2 (NAT networking mode).

.DESCRIPTION
  WSL2's internal IP changes on every restart, so the Windows-side portproxy rule
  needs to be re-applied each time. Run this script (as Administrator) after every
  `wsl --shutdown` / reboot, before starting `npm start` inside WSL.

.PARAMETER Port
  The Metro/Expo dev server port to forward. Defaults to 8081.

.EXAMPLE
  # From an elevated PowerShell:
  .\setup_expo_port_forward.ps1
#>

param(
  [int]$Port = 8081
)

$ErrorActionPreference = "Stop"

# Re-launch elevated if not already running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Port $Port"
  exit
}

Write-Host "=== Expo/Metro WSL2 Port Forward Setup (port $Port) ===" -ForegroundColor Cyan

$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
if (-not $wslIp) {
  Write-Error "Could not determine WSL2 IP. Is a WSL distro running? Try 'wsl' first, then re-run this script."
  exit 1
}
Write-Host "WSL2 IP: $wslIp"

# Replace any existing rule for this port
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 | Out-Null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp

$ruleName = "Expo Metro $Port"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null
}

Write-Host ""
Write-Host "Portproxy rules:" -ForegroundColor Cyan
netsh interface portproxy show v4tov4

$lanIp = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet|WSL" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress)

Write-Host ""
Write-Host "Done. Windows LAN IP appears to be: $lanIp" -ForegroundColor Green
Write-Host "In WSL, start Expo with:" -ForegroundColor Green
Write-Host "  REACT_NATIVE_PACKAGER_HOSTNAME=$lanIp npm start"
