/**
 * Semantic-release configuration. The Publish workflow runs it; see CONTRIBUTING.md#publishing.
 *
 * Releases never commit: `main` only fast-forwards to `staging` (see
 * .github/workflows/promote.yml), so the version is written into package.json in the CI workspace
 * only, and the committed version stays at the placeholder 0.0.0.
 */
module.exports = {
  branches: [
    // Release candidates, such as 1.1.0-rc.1, started nightly by nightly.yml, published to npm under
    // the `rc` dist-tag and tagged with a GitHub prerelease.
    { name: "staging", prerelease: "rc" },
    // Official releases, such as 1.1.0, cut when promote.yml fast-forwards main to staging.
    "main",
  ],
  tagFormat: "v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    [
      "@semantic-release/release-notes-generator",
      { preset: "conventionalcommits" },
    ],
    // Publishes official releases and candidates. Dry runs and other branches never publish.
    ["@semantic-release/npm", { npmPublish: true }],
    // Builds the API docs for the release, then reports the released version to the workflow. Runs
    // after @semantic-release/npm so the docs show the version it wrote into package.json, and in
    // `prepare` so a docs failure stops the release before it is tagged. Source links point at the
    // release tag. On main, publish.yml deploys docs/api to GitHub Pages only when the `version`
    // output is set, so dry runs and runs that release nothing never deploy. Commands are lodash
    // templates: `${...}` is a semantic-release value, so shell variables are written as `$NAME`.
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "npm run -s docs:api -- --gitRevision v${nextRelease.version}",
        successCmd:
          'if [ -n "$GITHUB_OUTPUT" ]; then echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"; fi',
      },
    ],
    "@semantic-release/github",
  ],
};
