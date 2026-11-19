# Agent Instructions

npm workspaces monorepo of Winston logging adapters. `CONTRIBUTING.md` has the full contributor guide.

## Commands

- Build: `npm run build`. Packages build in dependency order and depend on each other's `dist/`.
- Test one package or case: `npm test -w packages/<name> -- -g "<test name>"` (mocha with tsx). Use this while working.
- Full check: `npm run check` (build, typecheck, test). Run it once before finishing; the `pre-commit` hook runs it too, so commits are slow.
- API docs: `npm run docs:api`.

## Conventions

- `winston-host` is the shared base and must never import `vscode` or any host SDK. A new host is a new package implementing `Host`.
- New workspaces go in the root `package.json` `workspaces` list in dependency order.
- Packages ship as ESM.
- Commit messages and PR titles follow Conventional Commits; semantic-release derives versions from them. PRs are squash-merged.

## Warnings

- Never bump versions. `package.json` keeps the placeholder `0.0.0-semantically-released`; releases never commit.
- `dist/` and `docs/api/` are generated and gitignored. Don't edit them.
- Feature branches target `staging`. `main` is always an ancestor of `staging` and never gets commits of its own: never merge a PR into it (the Promote workflow fast-forwards it).

## Owned Dependency Chain

These `awalsh128` repos depend on each other. Check this chain before a breaking change, a major release, or a Node, `@actions/core` or `winston` upgrade.

| Repo                                                 | Ships                                                                                            | Depends on (owned)                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `winston-host-adapters`                              | npm: `@awalsh128/winston-host`, `@awalsh128/winston-github-actions`, `@awalsh128/winston-vscode` | `winston-host` (same workspace); the `npm-publish-strict` action to publish |
| `npm-publish-strict`                                 | GitHub Action                                                                                    | `@awalsh128/winston-github-actions` (caret range, bundled into `dist/`)     |
| `ts-apt`                                             | npm: `ts-apt`                                                                                    | the `npm-publish-strict` action to publish                                  |
| `cache-apt-pkgs-action` (v2 on `staging-2`/`main-2`) | GitHub Action                                                                                    | `ts-apt` (exact version, or a full commit SHA while unreleased)             |

- Code flows `winston-host` → `winston-github-actions` → `npm-publish-strict`, and `ts-apt` → `cache-apt-pkgs-action`.
- Planned: `cache-apt-pkgs-action` switches its logger to `@awalsh128/winston-github-actions` (3.x, exact pin).
- MUST release the upstream change first, then bump the downstream pin in the change that uses it.
- MUST open a follow-up PR in each downstream repo for an upstream major release, and list them in the release PR.
- MUST keep these aligned across the chain: ESM, `@actions/core` 3.x (`winston-github-actions` declares it as a `^3` peer), `winston` 3.x and `winston-transport` 4.x.
- Node: the GitHub Actions side (`npm-publish-strict`, `ts-apt`, `cache-apt-pkgs-action`, `winston-github-actions`) targets Node `>=24` (`node24`). `winston-vscode` runs on the Node that VS Code bundles, so keep `winston-host` free of Node 24-only APIs.
- `npm-publish-strict` and `winston-host-adapters` form a loop, which the pins break: a `winston-github-actions` release reaches the action only after `npm-publish-strict` bumps and releases, and `winston-host-adapters` keeps its pinned action SHA until it bumps it. Bump one side at a time.
- Pin `npm-publish-strict` to a full commit SHA that a release tag points at, and make the `# vX.Y.Z` comment match (`git tag --points-at <sha>`).
- This repo is the top of the chain: a breaking change to `@awalsh128/winston-github-actions` or its `@actions/core` peer range needs a major release and a follow-up PR in `npm-publish-strict` (and `cache-apt-pkgs-action` once it uses it).

## Housekeeping

- Delete branches, local and remote, whose work is finished: the pull request is merged or closed
  and the branch has no commits that are not already in it. Squash merges hide this from
  `git branch --merged`, so match each branch to its pull request and compare the branch tip with
  the pull request's head commit.
- Never delete the default or integration branches, a branch with an open pull request, or one with
  commits its pull request lacks; list those instead. Remove a worktree only after checking it has
  no uncommitted changes.

## Subagents

You are the only agent that edits files. Subagents only read and report. Use the `delegate` skill
before starting one, and the `progress-notes` skill for work that spans sessions.

## Single source for all AI tools

- Instructions: `AGENTS.md` only. `CLAUDE.md`, `.gemini/settings.json` and
  `.github/copilot-instructions.md` point to it; never add rules to them.
- Skills: `.agents/skills/` only. `.claude/skills` and `.github/skills` are symlinks to it.
- Roles: `.rulesync/subagents/` only. Every other role directory is generated output.

## More context

- `CONTRIBUTING.md`: read it for the branch model, per-package releases and the git hooks.
- `.out-of-scope/` lists ideas that were considered and rejected. Check it before proposing a
  feature.
