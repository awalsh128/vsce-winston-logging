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
