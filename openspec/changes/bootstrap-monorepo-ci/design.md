# Design

## Context

Greenfield: `/Users/abdulkalam/Chartnexa` has docs, ADRs and OpenSpec only; no git repo, no package manifests. Accepted ADRs: 0001 (Expo/TypeScript mobile), 0002 (NestJS modular monolith, Postgres, Prisma), 0009 (observability). The proposed monorepo sketch is in `docs/05_TECH_STACK_AND_ARCHITECTURE.md`. Environment observed: Node v26.12.0 is installed; pnpm is not. See proposal.md for scope and motivation.

## Goals / Non-Goals

**Goals:** a workspace where later changes add `apps/api` and `apps/mobile` without reworking tooling; fast, deterministic CI; secrets protected from day one.
**Non-Goals:** scaffolding Expo or NestJS, database, deployment, preview environments, release automation, code signing.

## Decisions

1. **pnpm workspaces.** Strict dependency resolution catches undeclared imports, which the spec requires. Alternatives: npm workspaces (weaker isolation), Yarn (fine, but pnpm is better supported by Expo monorepo guidance recently; verify at apply). Expo/Metro in a pnpm workspace may need `node-linker` or Metro config adjustments; the mobile change validates this early, and this change keeps the setting easy to change.
2. **Turborepo** for task orchestration and caching. Alternatives: Nx (heavier), plain pnpm scripts (no caching). Reversible.
3. **Node version pinned** in `.nvmrc` and `engines`. Node 26 is installed locally but may not be an LTS line; choose an active LTS version at apply time after checking Expo, NestJS and Prisma support. Do not assume the local version.
4. **TypeScript strict base config** shared via a `tsconfig.base.json`; each package extends it. ESLint flat config at root; Prettier for formatting; Vitest for shared packages.
5. **Placeholder packages:** `packages/api-contracts`, `packages/design-tokens` (the three brand hues `#FFFFFF`, `#111111`, `#2563EB` and `#EFF6FF` tint as constants), `packages/shared-types`. Each exports one trivial typed item and one test, only to prove the pipeline. No business logic.
6. **CI on GitHub Actions:** jobs for install (frozen lockfile), lint, typecheck, test, build, audit and secret scan; dependency caching; runs on push and pull request; branch protection requiring the checks. Alternatives: GitLab CI, CircleCI. The host is an assumption pending the owner's repo choice.
7. **Secret protection:** `.gitignore` for env files and build output, placeholder `.env.example`, secret scanning with gitleaks (or equivalent) in a pre-commit hook and in CI. Hooks via a lightweight manager (lefthook or husky). A hook is a convenience; CI is the authoritative gate.
8. **Dependency hygiene:** `pnpm audit` at high severity in CI; Dependabot or Renovate config. Every new dependency needs a license and compatibility check (CLAUDE.md).
9. **Docs:** a short `CONTRIBUTING.md` section with install, check, add-a-package commands, verified by running them.

## Risks / Trade-offs

- pnpm strictness may conflict with React Native/Metro later -> mobile change tests this first; fallback settings documented.
- Node version choice conflicts with a later dependency -> pick LTS and re-verify at each app change.
- Turborepo adds a tool to learn -> thin config; scripts remain plain package scripts.
- No git remote exists, so branch protection cannot be verified until the owner provides one -> tasks mark this as owner-dependent; local equivalents (hooks and the same commands) are verified meanwhile.
- Audit failures from transitive dependencies can block unrelated work -> documented exception process with expiry.

## Migration Plan

New files only; nothing to migrate. Rollback: delete the added tooling files. Later changes build on this layout.

## Open Questions

- Git host and repository name (needed for CI and branch protection); defaults to GitHub per proposal.
- Exact LTS Node version and tool versions, decided at apply after verification.
