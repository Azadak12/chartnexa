# Tasks

## 1. Repository and workspace setup

- [x] 1.1 Initialize git with a `.gitignore` (node_modules, build output, env files, OS files) and verify `git status` ignores a test `.env` and tracks `.env.example`.
- [x] 1.2 Choose the active LTS Node version after checking Expo, NestJS and Prisma support; write `.nvmrc` and `engines`; verify install under the pinned version succeeds and a wrong version is rejected or warned.
- [x] 1.3 Add `package.json`, `pnpm-workspace.yaml` and `turbo.json` with `apps/*` and `packages/*`; verify `pnpm install` produces a lockfile and a second install with `--frozen-lockfile` succeeds.

## 2. Shared tooling

- [x] 2.1 Add `tsconfig.base.json` (strict), ESLint flat config, Prettier and EditorConfig; verify a deliberate lint violation and a deliberate type error each fail the matching command, then remove them.
- [x] 2.2 Add Vitest root configuration and root scripts `lint`, `typecheck`, `test`, `build`, `check`; verify `pnpm check` exits 0 on the clean tree.

## 3. Placeholder shared packages

- [x] 3.1 Create `packages/shared-types` with one typed export and one test; verify build, typecheck and test pass for that package alone.
- [x] 3.2 Create `packages/design-tokens` with the brand constants (`#FFFFFF`, `#111111`, `#2563EB`, `#EFF6FF`) and a test asserting the values; verify the package checks pass alone.
- [x] 3.3 Create `packages/api-contracts` with one placeholder export and one test; verify an import of an undeclared dependency fails a check (then remove it).

## 4. Secrets and dependency hygiene

- [x] 4.1 Add `.env.example` (placeholders only) and a secret scanner run by a pre-commit hook; verify committing a fake private-key string is rejected, then remove it.
- [x] 4.2 Add an audit script (high severity) and update-automation config; verify the audit command runs and its failure mode is documented.

## 5. Continuous integration

- [x] 5.1 Add `.github/workflows/ci.yml` running frozen install, lint, typecheck, test, build, audit and secret scan with caching; verify the workflow file passes a syntax lint (for example actionlint) and every step command succeeds locally.
- [x] 5.2 Once the owner provides a remote, push, confirm a pull request with a deliberate failure shows red CI and cannot merge under branch protection, then confirm a clean one shows green; record the evidence. (Owner-dependent: blocked until a remote exists.)

## 6. Documentation and verification

- [x] 6.1 Write `CONTRIBUTING.md` with install, check, add-a-package and secret rules; verify by following it verbatim in a fresh clone in a temporary directory.
- [x] 6.2 Run the full `check` from a fresh clone and record the output; update `docs/05_TECH_STACK_AND_ARCHITECTURE.md` monorepo sketch to match the final layout.

## Evidence

- 5.1: actionlint could not be installed locally; GitHub parsed and ran the workflow successfully (PR 1, run 44044373475), and every step command also passed locally and in a fresh clone.
- 5.2: PR 1 showed green (check and audit pass). A throwaway PR 2 with a deliberate type error showed red CI. After the repository was made public (owner choice) and `main` protection added (required checks `check` and `audit`, strict), throwaway PR 3 with a deliberate type error showed `check` FAILURE and `mergeStateStatus: BLOCKED`. I did not attempt the merge itself, so blocking is evidenced by GitHub's merge state, not by a refused merge. Both throwaway PRs were closed unmerged.
- Branch protection does not require pull requests or reviews and does not apply to admins (`enforce_admins: false`), so the repository owner can still push or bypass.

## Workflow follow-up

- Review the change, then archive after verification. Next proposals: `api-foundation` and `mobile-shell-and-tokens`.
