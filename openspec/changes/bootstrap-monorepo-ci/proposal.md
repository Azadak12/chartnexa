# Proposal

## Why

The baseline (archived `establish-architecture-baseline`) accepted a TypeScript stack for mobile, API and shared packages, but the repository has no code layout, no shared tooling and no automated checks. Every later change (API foundation, mobile shell, auth) needs a place to live and a gate that proves it works. Setting up the workspace and CI first keeps later changes small and verifiable, as the Definition of Done in `docs/08_QUALITY_AND_TESTING.md` requires.

## What Changes

- Create a TypeScript workspace monorepo layout: `apps/` (empty for now), `packages/api-contracts`, `packages/design-tokens`, `packages/shared-types` as minimal placeholder packages that build, typecheck and have one passing test each.
- Add shared configuration: TypeScript base config (strict), ESLint, Prettier, EditorConfig, one test runner, pinned Node version, lockfile committed.
- Add CI that runs install, lint, typecheck, test and build on every push and pull request, and fails the build if any step fails.
- Add secret protection: `.gitignore`/`.env.example` conventions and an automated secret scan in CI and pre-commit.
- Add dependency hygiene: audit step in CI and automated update configuration.
- Add developer docs: how to install, run checks and add a package.
- **Not included:** the Expo mobile app, the NestJS API, database, Prisma, observability and any product feature. Those belong to `mobile-shell-and-tokens`, `api-foundation` and `observability-baseline`.

Assumptions (proposed, easy to change before apply):
- Package manager is **pnpm** with workspaces; build orchestration via **Turborepo** (task caching, only affected packages rebuild). Alternatives are recorded in design.md.
- CI host is **GitHub Actions**. The folder is not yet a git repository, so initializing git and a remote is part of the tasks and needs the owner's repo choice.
- Test runner is **Vitest** for shared packages; the API and mobile apps pick their own runners in their changes.

## Capabilities

### New Capabilities
- `repo-quality-gates`: the observable rules for repository health: required checks run automatically, a failing check blocks merge, secrets cannot be committed, and a fresh clone can install and verify with documented commands.

### Modified Capabilities
<!-- None -->

## Impact

- New top-level files: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, tsconfig/eslint/prettier configs, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`, `.nvmrc`.
- New dependencies (dev only): TypeScript, ESLint, Prettier, Vitest, Turborepo, a secret scanner. Versions, licenses and compatibility must be verified at apply time (CLAUDE.md rule).
- No runtime behavior, APIs, data or user-facing features change.
- Out of scope: deployment, hosting choice, store accounts, payment code, any secrets or credentials.
