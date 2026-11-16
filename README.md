# whyee

An Expo / React Native app for tracking personal daily-life categories (mood,
sleep, symptoms, habits, etc.) and surfacing statistical correlations between
them.

Whyee stores tracking data locally on the device. It supports configurable
categories and groups, multiple workspaces, duration and counter entries,
historical charts, summary statistics, lagged correlations, scheduled local
notifications, and JSON/ZIP backup and restore.

## Using the app

1. Open **Daily** and select **Edit categories** to configure what you want to
   track.
2. Enter values for the selected day. Use the date controls to review or edit
   earlier days.
3. Create separate workspaces for unrelated datasets or experiments.
4. Open **Stats** to view charts, summaries, and correlations. Statistics can be
   enabled or disabled from **Statistics settings**.
5. Open the gear menu to import or export app data.

Data, settings, and running duration timestamps are persisted locally. Most app
functionality works offline after installation. EAS cloud builds and Expo's
tunnel service require internet access.

Duration **Resume w/ gap** starts a new run at the current time, preserving the
paused gap. **Resume w/o gap** resumes from the displayed stop time so the pause
counts toward the duration. Both honor edits to that stop time.

## Structure

- [App.tsx](App.tsx) — app entry component
- `src/components/` — screens and UI panels (category input, charts, correlation results)
- `src/lib/` — correlation engine, category/group models, statistics, date helpers
- `src/hooks/` — persistent state hooks
- `src/workers/` — background correlation computation
- `src/theme/` — design tokens
- `__tests__/` — Jest test suites
- [docs/CATEGORY_CATALOG.md](docs/CATEGORY_CATALOG.md) — reference catalog of trackable category configurations
- [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) — guidance for AI coding agents working in this repo
- [ANDROID_WSL_STARTUP.md](ANDROID_WSL_STARTUP.md) — steps for running on a physical Android device from WSL2

## Setup

Requirements:

- Node.js and npm
- Expo Go for basic device testing
- An Expo account and EAS CLI for APK builds

Install the locked dependency set after cloning or pulling dependency changes:

```bash
npm ci
```

Use `npm install` when intentionally changing dependencies and committing the
resulting `package-lock.json` update.

Check Expo package compatibility:

```bash
npx expo install --check
npx expo-doctor@latest
```

## Development

### Expo Go

For a clean tunnel-based start from Linux or Fedora Remix under WSL:

```bash
rm -rf .expo && npm start -- --tunnel --clear
```

Scan the new QR code with Expo Go. Fully close any previous Expo Go session when
testing changes after clearing Metro's cache.

For LAN mode, which does not require Expo's tunnel service:

```bash
npm start
```

The project start helper auto-detects the Windows LAN address when run under
WSL. On Windows 10/WSL2 NAT, first run this from an elevated Windows PowerShell
terminal after Windows or WSL restarts:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup_expo_port_forward.ps1
```

Then start Metro from WSL and scan the QR code. See
[ANDROID_WSL_STARTUP.md](ANDROID_WSL_STARTUP.md) for details.

Expo Go cannot exercise every standalone native feature. In particular,
Android push-notification support was removed from Expo Go in SDK 53. Whyee
gracefully disables unavailable optional native modules in Expo Go, but local
notification and release-specific behavior should be tested in a development
build or APK.

### Other development targets

```bash
npm run android
npm run ios
npm run web
```

### Development test workspaces

Test fixtures are hidden until you create a workspace named `testChoice`,
`testNumber`, `testDuration`, `testCounter`, `testNotes`, or `testData`
(case-insensitive). `testChoice` copies the original test workspace's categories,
groups, and complete saved history when present. The type-specific workspaces
include 53 days of deterministic history, lagged/constant/noisy series, missing
days, repeated entries, and type-specific boundaries. `testData` showcases two
modes of each category type with history.

The original test workspace stays hidden and its stored data is preserved.
Fixture generators and name triggers are excluded from production bundles;
creating these names in production makes ordinary workspaces. Previously saved
or imported workspace data is not deleted.

`npm run android` and `npm run ios` require the corresponding native SDK and
device/emulator environment. iOS native builds require macOS.

## Build an installable Android APK

The `preview` EAS profile uses internal distribution and produces an APK that
can be installed directly on an Android device. The `production` profile is for
store distribution and normally produces an Android App Bundle (`.aab`).

### One-time EAS setup

Install EAS CLI and authenticate from the same Linux/WSL environment used to
run the project:

```bash
npm install --global eas-cli
eas login
eas whoami
```

If the global `eas` command is unavailable, use `npx eas-cli@latest` in place of
`eas` below.

The project is already linked through the EAS project ID in `app.json`. A new
checkout can verify or restore EAS configuration with:

```bash
eas build:configure
```

### APK preflight

```bash
npm ci
npx expo install --check
npx expo-doctor@latest
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/jest/bin/jest.js --ci
npx expo export --platform android --clear
```

### Build the APK

Use a cleared EAS cache after native dependency, plugin, or app configuration
changes:

```bash
eas build --platform android --profile preview --clear-cache
```

EAS uploads the project, performs the Android build in the cloud, and prints a
build page/download URL. Open that URL on the device or copy the downloaded APK
to it.

Install over USB with Android Debug Bridge when available:

```bash
adb install -r ./whyee.apk
```

If Android rejects an in-place update because the signing certificate differs,
back up app data, uninstall the old package, and install the new APK. Uninstalling
deletes locally stored app data.

### Production/store build

```bash
eas build --platform android --profile production --clear-cache
```

Use the resulting `.aab` for Google Play. It cannot normally be sideloaded like
an APK.

### Diagnose an APK startup crash

Build success does not reveal errors that occur only on a device. Capture the
Android runtime exception while launching the app:

```bash
adb logcat -v threadtime | grep -E \
	'FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|libc|correlationmobile'
```

The Android package ID is `com.oneeyedziggy.correlationmobile`.

## Testing

```bash
npm test
npm run test:watch
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/jest/bin/jest.js --ci
```

On Windows, if `npx` is blocked by execution policy, run binaries directly:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\jest\bin\jest.js --ci
```

## Backup and restore

Open the gear menu in the top-right corner to export or import app data. Exports
can include any registered workspace's categories, groups, and logged data, plus
global analysis settings and app preferences. Derived correlation results and
caches are recalculated and are not included.

Exports default to a combined `Whyee.config.zip`. Individual-file mode keeps
each selected data group as a separate JSON entry inside that ZIP. ZIP can be
disabled to produce an importable `Whyee.config.json` or separately named
`Whyee.<workspace>.<section>.config.json` files.

Imports accept generated Whyee JSON or ZIP files after validating their schema
and category, group, and record references. Overwrite replaces only sections
present in the selected file. Merge can favor imported values, favor local
values, or review conflicts individually with an option to apply a decision to
the remaining conflicts.

Android asks for a destination folder. iOS opens the system share sheet, where
Save to Files provides location selection. Web starts a browser download; the
browser controls whether it asks for a location.

## Notes

- Built with Expo 57 (`app.json`), React Native, and TypeScript.
- The preview APK build is configured in [eas.json](eas.json).
- Do not rely on Expo Go alone for notifications, native Worklets, or final APK
  behavior.
- See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before making agent-driven changes.
