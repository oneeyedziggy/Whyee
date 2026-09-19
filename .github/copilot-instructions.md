# Copilot guidance

## Project map

- Expo 57 / React Native app: `App.tsx` and `src/`
- `src/components/`: UI panels and editors
- `src/lib/`: shared domain, date, statistics, and correlation logic
- `src/workers/`: correlation task adapters
- `__tests__/`: Jest tests

## Keep context focused

- Skip `docs/CATEGORY_CATALOG.md` unless the task concerns category templates or catalog content.
- Read the owning component and its focused test before exploring adjacent panels.
- Prefer shared helpers in `src/lib/sort.ts` and `src/lib/summaryStats.ts` over local copies.
- Use `src/components/SortHeader.tsx` for sortable table headers.
- Consult repository notes at `/memories/repo/notes.md` for date keys, record updates, and virtual-series invariants.

## Validation

- Typecheck with `node .\\node_modules\\typescript\\bin\\tsc --noEmit`.
- Run tests with `node .\\node_modules\\jest\\bin\\jest.js --ci` when `npx` is blocked.
- Preserve Expo platform resolution and validate focused tests before broad refactors.
