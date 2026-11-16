# @awalsh128/winston-github-actions

A [Winston](https://github.com/winstonjs/winston) logger for GitHub Actions workflows, writing
through [`@actions/core`](https://github.com/actions/toolkit/tree/main/packages/core). Part of the
[winston host adapters](https://github.com/awalsh128/vsce-winston-logging#readme), and an unofficial
extension of Winston, not affiliated with the Winston project.

- 📌 **Annotations**: errors and warnings can point at a file and lines.
- 🐞 **Follows the runner's debug setting**: `RUNNER_DEBUG` or `ACTIONS_STEP_DEBUG` turns on `debug`
  and `trace`, with no level to set by hand.
- 📂 **Groups**: wraps work in a collapsible group and logs how long it took.
- 🔒 **Secret masking**: `maskSecret()` calls `core.setSecret`.

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

| Logger method | `@actions/core` | Shown |
| --- | --- | --- |
| `error` | `error`, with file and lines from the location | Always |
| `warn` | `warning`, with file and lines from the location | Always |
| `info` | `info` | Always |
| `debug`, `trace` | `debug` | When debug logging is on |

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
`maskSecret` is the runner's masking of the workflow log; other transports you add are not masked.

## Requirements

`@actions/core` `>=1.10 <3` as a peer dependency, tested with 2.0.3. Version 3 is ESM-only and this
package is CommonJS, so it is not supported yet. The package re-exports
[`@awalsh128/winston-host`](https://github.com/awalsh128/vsce-winston-logging/tree/staging/packages/winston-host#readme).
