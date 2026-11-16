# Dependency security

## Expo CLI Zod override

Expo SDK 57's CLI requests Zod 3.25.76. The root manifest overrides only
`@expo/cli`'s Zod dependency to 4.6.7 to address
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
The advisory affects versions below 4.6.6.

This crosses a dependency major version. Run `npm run validate:expo-zod`
after dependency changes. The check resolves Zod from the actual Expo CLI
package and exercises its plugin/output schemas, validation errors, JSON
schema generation and MCP tool registration. It does not establish
compatibility with an optional, separately installed MCP tunnel package.
Also validate Expo config loading, Android/web production exports, the
full Jest suite and TypeScript. Replace this override with a supported
upstream CLI fix when SDK 57 supplies one.

## Remaining low-severity advisory

`deepmerge@4.3.1`, used by Expo configuration and Jest configuration, remains
affected by
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
As of 2026-10-30, the latest published release is 4.3.1 and the advisory
lists no patched version. Only merge trusted project configuration; track
upstream for a compatible fix. Its affected dependency paths are tooling
paths, not evidence that the package executes in the shipped application.

Do not use `npm audit fix --force` to clear these findings: npm currently
proposes downgrading Expo to SDK 51 and incompatible test dependencies.
Do not downgrade deepmerge solely to fall outside the advisory's range.

Audit the complete dependency tree with `npm audit --audit-level=high`.
The security update removes all high/critical findings but does not
suppress the remaining low findings.
