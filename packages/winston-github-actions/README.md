# @awalsh128/winston-github-actions

A [Winston](https://github.com/winstonjs/winston) logger for GitHub Actions workflows, writing
through [`@actions/core`](https://github.com/actions/toolkit/tree/main/packages/core). Part of the
[winston host adapters](https://github.com/awalsh128/winston-host-adapters#readme), and an unofficial
extension of Winston, not affiliated with the Winston project.

- 📌 **Annotations**: errors and warnings can point at a file and lines.
- 🐞 **Follows the runner's debug setting**: `RUNNER_DEBUG` or `ACTIONS_STEP_DEBUG` turns on `debug`
  and `trace`, with no level to set by hand.
- 📂 **Groups**: wraps work in a collapsible group and logs how long it took.
- 🧮 **Unlimited annotations**: an optional Octokit transport reports them through the Checks API.
- 🔒 **Secret masking**: `maskSecret()` calls `core.setSecret`.

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/awalsh128)

If you find this project useful, please consider [sponsoring it](https://github.com/sponsors/awalsh128) and show some ❤️ for open source maintainers.

## Quick Start

```sh
npm install @awalsh128/winston-github-actions @actions/core
```

```ts
import { ActionsLogger } from "@awalsh128/winston-github-actions";

const logger = new ActionsLogger();
logger.info("Scanning");
logger.forLocation({ path: "src/app.ts", line: 3, endLine: 6 }).error("Block is not sorted");
logger.debugLazy(() => `Config: ${JSON.stringify(config)}`); // only built when debug logging is on
```

## Levels

| Logger method    | `@actions/core`                                  | Shown                    |
| ---------------- | ------------------------------------------------ | ------------------------ |
| `error`          | `error`, with file and lines from the location   | Always                   |
| `warn`           | `warning`, with file and lines from the location | Always                   |
| `info`           | `info`                                           | Always                   |
| `debug`, `trace` | `debug`                                          | When debug logging is on |

The level is `trace` when `core.isDebug()`, `RUNNER_DEBUG=1`, or `ACTIONS_STEP_DEBUG` is `true` or
`1`, and `info` otherwise. It is read once when the logger is created.

## Groups and secrets

```ts
async function build() {
  const group = logger.group("Build"); // startGroup now
  try {
    await run();
  } finally {
    group.dispose(); // endGroup, then "Build (42ms)"
  }
}

logger.maskSecret(token); // the runner masks it in the workflow log from now on
```

Groups don't nest in a workflow log, so a group started inside another only logs its time.

## Using the transport alone

`ActionsTransport` works in any Winston logger, so you can skip `ActionsLogger`:

```ts
import * as winston from "winston";
import { ActionsTransport } from "@awalsh128/winston-github-actions";

const logger = winston.createLogger({ transports: [new ActionsTransport()] });
```

`error` and `warn` become annotations, pointing at `info.location` when a line has one. `debug` and
`trace` become debug lines, and every other level becomes a plain log line.

`maskSecret` is the runner's masking of the workflow log; other transports you add are not masked.

## Annotations beyond the limit

Workflow commands show at most 10 errors and 10 warnings per step. `CheckRunTransport` collects
errors and warnings that have a location, and reports them all as one check run through the
[Checks API](https://docs.github.com/rest/checks/runs), 50 annotations per request, so they show on
the pull request's diff. Pass it an Octokit, such as `getOctokit` from
[`@actions/github`](https://github.com/actions/toolkit/tree/main/packages/github) (8.x; 9.x is
ESM-only). The package itself needs no Octokit dependency.

```ts
import * as github from "@actions/github";
import { ActionsLogger, CheckRunTransport } from "@awalsh128/winston-github-actions";

const checkRun = new CheckRunTransport({ octokit: github.getOctokit(token) });
const logger = new ActionsLogger({ transports: [checkRun] });

logger.forLocation({ path: "src/app.ts", line: 3 }).error("Block is not sorted");
await checkRun.flush(); // one check run with every collected annotation
```

| Option       | Default           | Purpose                                                                                             |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| `octokit`    | required          | An Octokit with the Checks API                                                                      |
| `target`     | `targetFromEnv()` | `{ owner, repo, sha }`; reads `GITHUB_REPOSITORY`, and a pull request's head commit or `GITHUB_SHA` |
| `name`       | `Log annotations` | The check run's name                                                                                |
| `conclusion` | `neutral`         | How it concludes; `neutral` keeps logged errors from failing the commit's checks                    |

> [!IMPORTANT]
> The job needs `permissions: checks: write`. Pull requests from forks get a read-only token, so
> `flush()` fails there. Lines without a location, and levels other than `error` and `warn`, are
> not annotated; they still go to the workflow log.

## Requirements

`@actions/core` `>=1.10 <3` as a peer dependency, tested with 2.0.3. Version 3 is ESM-only and this
package is CommonJS, so it is not supported yet. The package re-exports
[`@awalsh128/winston-host`](https://github.com/awalsh128/winston-host-adapters/tree/staging/packages/winston-host#readme).
