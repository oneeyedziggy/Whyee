# Dependency security

## Resolved: Expo CLI Zod override

Expo SDK 57's CLI requested Zod 3.25.76, which was affected by
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5),
and the root manifest overrode `@expo/cli`'s Zod dependency to 4.6.7 with a
`validate:expo-zod` check script. Expo SDK 58's CLI no longer depends on Zod
(it uses `@expo/schema-utils`), so the override and the validation script
were removed with the SDK 58 upgrade.

## Resolved: minimatch and glob ReDoS/traversal overrides

`minimatch` 7.0.0–11.0.0 is affected by
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
(globparts amplification DoS) and `glob` 9.0.0–14.0.1 by
[GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4)
(AbortSignal cancellation bypass). Jest and Expo tooling pinned ranges inside
the affected windows, so the root manifest overrides the vulnerable ranges
(`minimatch@^9`/`^10` → `^11.0.1`, `glob@^10`/`^13` → `^14.0.2`). The
`glob@7.2.3`/`minimatch@3.1.5` copies under the older `test-exclude` are
outside both advisories' ranges and are left alone. Note: npm applied these
range-scoped overrides inconsistently on an incremental install; a clean
reinstall (delete `node_modules` and `package-lock.json`) was required for
them to take effect across all deduped branches.

## Remaining high advisory with no published fix

`picomatch` (all versions ≤4.0.7, which is the latest release as of
2026-11-17) is affected by
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
(ReDoS via single-branch repeated extglobs, e.g. `+(*a)`). The advisory lists
**no patched version**, and the referenced upstream PR
([micromatch/picomatch#194](https://github.com/micromatch/picomatch/pull/194))
is unmerged and explicitly does not fix this CVE. Because picomatch sits under
micromatch, tinyglobby, anymatch, metro, jest, and the Expo CLI, this single
advisory currently cascades into ~60 "high" `npm audit` findings. All affected
paths are build/test tooling that parses developer-supplied glob patterns on
the development machine; no attacker-controlled patterns reach picomatch in
the shipped application. Track the advisory for a patched release and bump
then; no override or downgrade can clear it today.

## Remaining low-severity advisory

`deepmerge@4.3.1`, used by Expo configuration and Jest configuration, remains
affected by
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
As of 2026-10-30, the latest published release is 4.3.1 and the advisory
lists no patched version. Only merge trusted project configuration; track
upstream for a compatible fix. Its affected dependency paths are tooling
paths, not evidence that the package executes in the shipped application.

Do not use `npm audit fix --force` to clear these findings: npm currently
proposes downgrading Expo to SDK 51 and incompatible test dependencies, and
no downgrade removes picomatch from the tree in any case. Do not downgrade
deepmerge solely to fall outside the advisory's range.

Audit the complete dependency tree with `npm audit --audit-level=high`.
Moderate and below are fully resolved; the only high findings are the
picomatch cascade described above.
