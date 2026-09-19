#!/usr/bin/env bash
# Starts Expo, auto-detecting the Windows host LAN IP from WSL so Expo Go on a
# phone can reach Metro through the netsh portproxy rule (see
# setup_expo_port_forward.ps1). Pass "web" as the first argument to skip IP
# detection and start the web target instead.
set -e
cd "$(dirname "$0")/.."

if [ "$1" = "web" ]; then
  shift
  exec npx expo start --web "$@"
fi

ip=$(powershell.exe -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { \$_.InterfaceAlias -notmatch 'Loopback|vEthernet|WSL' -and \$_.IPAddress -notlike '169.254.*' } | Select-Object -First 1 -ExpandProperty IPAddress)" | tr -d '\r')

if [ -z "$ip" ]; then
  echo "Warning: could not detect Windows LAN IP; falling back to default Expo host detection." >&2
  exec npx expo start "$@"
fi

echo "Using Windows LAN IP: $ip"
REACT_NATIVE_PACKAGER_HOSTNAME="$ip" exec npx expo start "$@"
