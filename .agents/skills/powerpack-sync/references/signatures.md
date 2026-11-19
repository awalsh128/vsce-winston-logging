# Set signatures

A repo uses a set when its signature file exists. Check these paths, and treat the set as unused
when none match.

| Set | Signature |
| --- | --- |
| `common` | `.github/labels.yaml` or `.github/workflows/codeql.yml` |
| `conventional-commits` | `commitlint.config.mjs` |
| `release-flow` | `.github/workflows/promote.yml` |
| `node` | `.github/actions/setup/action.yml` |
| `npm-publish` | `release.config.cjs` with `.github/workflows/release.yml` |
| `npm-pages` | `typedoc.json` |
| `vscode-extension` | `.github/workflows/publish-extension.yml` |
| `cpp` | `.clang-format` |
| `dotnet` | `.editorconfig` containing `dotnet_` rules |
| `rust` | `.github/workflows/rust.yml` or `rustfmt.toml` |
| `agentic` | `.rulesync/`, `.agents/skills/delegate/`, or `.github/copilot-instructions.md` that points to `AGENTS.md` |

A file can match one signature and still be edited by hand. Compare the files of a detected set
one by one rather than treating the whole set as in sync or out of sync.
