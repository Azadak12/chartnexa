# Contributing

## Requirements
- Node 26 (see `.nvmrc`). Install with your version manager.
- pnpm 12 via Corepack: `corepack enable pnpm`.

## Database for tests
API tests and `pnpm check` need a local PostgreSQL 16 (they create and drop scratch databases). On macOS: `brew install postgresql@16` and start it. See `apps/api/README.md`.

## Install and verify
```bash
pnpm install --frozen-lockfile
pnpm check
```
`pnpm check` runs lint, format check, typecheck, tests, build and the secret scan. CI runs the same steps plus `pnpm audit:deps`.

## Add a package
1. Create `packages/<name>/` with `package.json` (`@chartnexa/<name>`), `tsconfig.json`, `tsconfig.build.json` and `src/`, copying an existing package.
2. Declare every dependency explicitly, using `workspace:*` for sibling packages.
3. Add at least one test. Run `pnpm install` and `pnpm check`.

## Secrets
Never commit real secrets. Use `.env` locally (git-ignored); only `.env.example` with placeholders is tracked. A pre-commit hook and CI run `secretlint`. Use development and sandbox credentials only.

## Dependency audit
`pnpm audit:deps` fails on high or critical advisories. If a fix is not yet available, record an exception with an owner and expiry date in the pull request.

## Workflow
Changes follow OpenSpec: proposal, spec, design, tasks, review, implementation, verification, archive. See `CLAUDE.md`.
