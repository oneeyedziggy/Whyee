# whyee

An Expo / React Native app for tracking personal daily-life categories (mood,
sleep, symptoms, habits, etc.) and surfacing statistical correlations between
them.

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

```bash
npm install
```

## Development

```bash
npm start        # auto-detects LAN IP for Expo Go on a phone (see scripts/expo-start.sh)
npm run android
npm run ios
npm run web
```

## Testing

```bash
npm test         # jest --runInBand
npm run test:watch
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

- Built with Expo (`app.json`), React Native, and TypeScript.
- See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) before making agent-driven changes.
