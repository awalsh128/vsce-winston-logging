# Contributing

## Development

```sh
npm install       # also installs the husky git hooks through the prepare script
npm run check     # build, typecheck and unit tests for every package
npm run build     # emits dist/ in each package
npm run docs:api  # builds the API docs into docs/api
```

This is an npm workspaces monorepo. Package builds depend on each other's `dist/`, so the
workspaces are listed in dependency order in the root `package.json`, and `check` builds before it
typechecks and tests.

| Package                                                         | What it is                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| [`winston-host`](packages/winston-host)                         | Shared base. Depends only on Winston; never imports `vscode` |
| [`winston-vscode`](packages/winston-vscode)                     | VS Code adapter; re-exports the base                         |
| [`winston-github-actions`](packages/winston-github-actions)     | GitHub Actions adapter; re-exports the base                  |
| [`vsce-winston-logging`](packages/vsce-winston-logging)         | Deprecated shim that re-exports `winston-vscode`             |

Keep host-specific imports out of `winston-host`. A new host is a new package that implements `Host`.

Two git hooks run locally:

| Hook         | Runs                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `pre-commit` | `npm run check`                                                              |
| `commit-msg` | [commitlint](https://commitlint.js.org) with the Conventional Commits config |

## Commits

Commit messages and pull request titles follow
[Conventional Commits](https://www.conventionalcommits.org). semantic-release turns them into the
next version:

| Commit                                                       | Calls for |
| ------------------------------------------------------------ | --------- |
| `fix: ...`, `perf: ...`                                      | patch     |
| `feat: ...`                                                  | minor     |
| `feat!: ...` or a `BREAKING CHANGE:` footer                  | major     |
| `docs:`, `ci:`, `chore:`, `refactor:`, `test:`, `build:` ... | none      |

Pull requests are squash-merged with the title as the commit subject, so the Pull Request workflow
lints the title.

## Releases

Releases are made by [npm-publish-strict](https://github.com/awalsh128/npm-publish-strict), which
runs [semantic-release](https://semantic-release.gitbook.io) with its own config, with `vX.Y.Z` tags.

Releases never commit. The committed `package.json` keeps the placeholder version `0.0.0-semantically-released`, and
semantic-release writes the real version into it in the CI workspace only. The tags and GitHub
releases are the version history.

### Branches

`main` is always an ancestor of `staging`: it only ever points at a commit that is already on
`staging`, and never has commits of its own.

- Feature branches target `staging`. A `staging` ruleset should require a pull request with passing
  CI and Pull Request checks, and block force pushes and deletion.
- Promote with the **Promote staging to main** workflow
  ([promote.yml](.github/workflows/promote.yml)), run by hand. It requires a successful CI run on
  `staging`'s latest commit, fast-forwards `main` to it, then starts the official release. It fails
  rather than force-pushing if `main` has commits that `staging` doesn't.
- The `main` ruleset should block every update except from the
  [Octo STS](https://github.com/octo-sts/app) GitHub App, whose token the promote workflow uses (see
  [Release Credentials](#release-credentials)).
- Never merge into `main` with a pull request: merge, squash and rebase merges all add a commit to
  `main` that `staging` doesn't have.

### Publishing

Each package is versioned and released on its own, from the Conventional Commits that touch its
directory. `publish.yml` runs
[npm-publish-strict](https://github.com/awalsh128/npm-publish-strict) once per package, in
dependency order, with the package's `working-directory`, `tag-format`, `commit-paths` and
`pin-dependencies`:

| Package                  | Tags                          | Depends on (pinned at release)  |
| ------------------------ | ----------------------------- | ------------------------------- |
| `winston-host`           | `winston-host-vX.Y.Z`         |                                 |
| `winston-vscode`         | `winston-vscode-vX.Y.Z`       | `winston-host`                  |
| `winston-github-actions` | `winston-github-actions-vX.Y.Z` | `winston-host`                |
| `vsce-winston-logging`   | `vX.Y.Z` (its original tags)  | `winston-vscode`                |

- Packages keep the placeholder version, and internal dependencies keep the placeholder too. At
  release, each internal dependency becomes `^` and the latest released version of that package, in
  the CI workspace only.
- A change to `winston-host` does not release the adapters. Release them with a commit of their own
  when they should pick up the new base; their `^` range already accepts compatible versions.
- The first release of each package, and of each new package name, is published by hand so the
  package exists on npm, and then given a trusted publisher (see
  [Trusted Publishing](#trusted-publishing)). The release fails on a package until that is set.

Every release is gated by CI on the exact commit being released:

| Branch    | Releases                   | Example      | Started by                                   |
| --------- | -------------------------- | ------------ | -------------------------------------------- |
| `staging` | Release candidates         | `1.2.0-rc.1` | The nightly workflow, when npm files changed |
| `main`    | Official (stable) releases | `1.2.0`      | The promote workflow                         |

- The [Nightly release candidate](.github/workflows/nightly.yml) workflow runs daily on `main`'s
  schedule and starts `publish.yml` on `staging` only if a package's sources or manifest,
  `package.json`, `package-lock.json` or `tsconfig.base.json` changed since the last release tag. The release
  still needs CI to have passed on `staging`'s latest commit, and semantic-release still skips it
  when no commit since the last release calls for a version.
- Each release candidate increments the `rc` number until the version is promoted. Candidates get a
  tag, a GitHub prerelease and an npm publish under the `rc` dist-tag, so `npm install
vsce-winston-logging` still gets the official release.
- Releases publish to npm through trusted publishing, with provenance. npm trusts only
  [publish.yml](.github/workflows/publish.yml) started on its own, which is how both the nightly
  workflow and promote start it.
- Every release builds the API docs (each package's `typedoc.json`; the docs site is rebuilt whole) in semantic-release's `prepare`
  step, through `@semantic-release/exec`, so a docs failure stops the release before it is tagged.
  Only official releases deploy them to GitHub Pages; candidates and runs that release nothing
  leave the site unchanged. Pages must be set to deploy from GitHub Actions, and the `github-pages`
  environment restricted to `main`.
- Manual runs first require a successful CI run for the commit. Start one with `dry-run: true` to
  preview the next version without tagging:

  ```sh
  gh workflow run publish.yml --ref staging -f dry-run=true
  ```

Release jobs install dependencies with `--ignore-scripts`, because they can mint registry and GitHub
tokens. The release tools are locked by the pinned npm-publish-strict version.

### Release Credentials

The workflows store no secrets. Each job exchanges its GitHub OIDC token (`id-token: write`) for
short-lived credentials:

| Credential              | Used by                                      | Issued under                                                                    |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| GitHub token for `main` | `promote.yml` on `staging`                   | Octo STS trust policy [promote.sts.yaml](.github/chainguard/promote.sts.yaml)   |
| GitHub token for tags   | The `Create tag token` step in `publish.yml` | Octo STS trust policy [release.sts.yaml](.github/chainguard/release.sts.yaml)   |
| npm credentials         | `publish.yml`                                | npm [trusted publishing](#trusted-publishing), naming the `release` environment |

GitHub rejects tag creation and updates to `main` by `GITHUB_TOKEN` under the rulesets, so those go
through the [Octo STS](https://github.com/octo-sts/app) GitHub App, which mints a token when a job's
OIDC token matches a trust policy in `.github/chainguard/`. Setup:

1. [Install the Octo STS app](https://github.com/apps/octo-sts/installations/new) on this
   repository.
2. Add the app as a bypass actor to the `main` ruleset and to the ruleset that restricts tag
   creation.
3. Restrict the `release` environment to `main` and `staging`. npm trusts only jobs in it.

Octo STS reads trust policies from the default branch (`main`), so a policy change takes effect when
it is promoted. The policies match the owner and repository IDs in the OIDC subject, the branch, and
the exact workflow file.

### Trusted Publishing

npm is reached with [trusted publishing](https://docs.npmjs.com/trusted-publishers): the job's
GitHub OIDC token is exchanged for a short-lived publish token. The package's settings on
npmjs.com must list this repository, `publish.yml` and the `release` environment as a trusted
publisher. Trusted publishers are set on an existing package, so the first version is published by
hand.

Run a dry run of `publish.yml` after changing it or the pinned action version. A dry run checks the
configuration but does not publish.

## License

By contributing, you agree that your contributions are licensed under the Apache-2.0 License.
