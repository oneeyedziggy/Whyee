# Android / WSL Startup Reminder

Steps to run this app on a physical Android device via Expo Go, when developing
inside a WSL2 distro on Windows 10 (NAT networking, no `adb`/emulator).

## Every time WSL or Windows restarts

WSL2's internal IP changes on restart, so the Windows -> WSL port forward must
be re-applied.

**1. From a Windows PowerShell terminal** (not WSL), in the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_expo_port_forward.ps1
```

This detects the current WSL2 IP, re-applies the `netsh portproxy` rule for
port 8081, ensures the firewall rule exists, and prints your Windows LAN IP.
It self-elevates via UAC for the admin-only steps.

**2. From WSL**, in the repo root:

```bash
npm start
```

This runs [scripts/expo-start.sh](scripts/expo-start.sh), which auto-detects
the Windows LAN IP (via `powershell.exe`) and sets
`REACT_NATIVE_PACKAGER_HOSTNAME` before starting Expo.

**3.** Scan the QR code with Expo Go on your phone (same Wi-Fi network as the PC).

## One-time setup

Install the `expo-start` bash helper so you can run it from any directory:

```bash
npm run setup:expo-helper
source ~/.bashrc   # or open a new terminal
```

Then `expo-start` / `expo-start web` work from anywhere.

## Notes

- Web target doesn't need any of the above — `npm run web` (or `expo-start web`)
  skips IP detection and runs `expo start --web` directly.
- Mirrored WSL2 networking (`networkingMode=mirrored` in `.wslconfig`) would
  avoid all of this, but it requires Windows 11 22H2+; this setup targets
  Windows 10.
- If `npm start` can't detect the LAN IP, it falls back to Expo's default host
  detection and prints a warning — you'll likely need to fall back to
  `npm start -- --tunnel` (requires an ngrok account/authtoken) in that case.
