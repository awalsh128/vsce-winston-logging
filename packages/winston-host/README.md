# @awalsh128/winston-host

The shared base of the [winston host adapters](https://github.com/awalsh128/winston-host-adapters#readme).
It depends only on [Winston](https://github.com/winstonjs/winston) and never imports `vscode`. This is
an unofficial extension of Winston and is not affiliated with the Winston project.

Use it to write an adapter for a new host. For VS Code or GitHub Actions, install
[`@awalsh128/winston-vscode`](https://github.com/awalsh128/winston-host-adapters/tree/staging/packages/winston-vscode#readme)
or [`@awalsh128/winston-github-actions`](https://github.com/awalsh128/winston-host-adapters/tree/staging/packages/winston-github-actions#readme),
which re-export this package.

## What's in it

| Export | What it is |
| --- | --- |
| `Host`, `HostSink` | What an adapter implements: where lines go, the host's level, level changes, disposal. |
| `HostLogger`, `HostTransport` | The Winston logger and transport that use a `Host`. `forLocation(location)` makes a child logger. |
| `LazyLogger` | Winston logger whose level methods take a function as the message, plus the `errorLazy`, `warnLazy`, `infoLazy`, `debugLazy`, `traceLazy` and `logLazy` aliases. Self-contained in `lazy.ts`. |
| `LogLevel`, `LOG_LEVELS` | `error`, `warn`, `info`, `debug`, `trace`. |
| `Location` | `{ path, line?, endLine?, column? }`, the host-neutral place a message is about. |
| `defaultFormat`, `plainFormat`, `toLogText`, `rangeText` | Message formatting. |
| `Benchmark`, `DisposableBenchmark` | Stopwatches; the second logs its time when disposed. |
| `logAndGetError`, `setLogLevel` | Log an error and get it back to throw; set a logger's and its transports' level. |

```ts
import { HostLogger, type Host } from "@awalsh128/winston-host";

const host: Host = {
  sink: { write: (level, message) => console.log(`[${level}] ${message}`) },
  getLevel: () => "info",
};
new HostLogger(host).infoLazy(() => "ready");
```

## Lazy logging

Level methods take a function as the message and call it only when the level is enabled, so an
expensive message costs nothing when it is not logged. The function's result is the message, and
anything after it is metadata:

```ts
logger.debug(() => `Response:\n${JSON.stringify(response, null, 2)}`);
logger.debug(() => buildMessage(), { requestId });
logger.debugLazy(() => buildMessage()); // the same, for a function that returns a string
```

This is the API of [Winston PR #2626](https://github.com/winstonjs/winston/pull/2626), which is not
in a Winston release yet, so this package supplies it:

- **At compile time**, importing this package augments Winston's `LeveledLogMethod` type, so
  `logger.debug(() => message, meta)` type-checks. It applies to every `winston.Logger` in the
  program, but only a `LazyLogger` (and so a `HostLogger`) runs the function at run time. A plain
  `winston.createLogger()` logger on a released Winston does not.
- **At run time**, `LazyLogger` calls the function itself. When the installed Winston already has
  the feature, `usesNativeLazy()` is `true` and a lone function goes to Winston's own level method.
  A function followed by metadata always uses this package's code, because the PR's first version
  drops that metadata. Detection logs a throwaway line through a probe logger once, and relies on
  the level methods being on the prototype of the logger `createLogger` returns.

A logger that is silent (level `off`) never calls the function. All of this is in `lazy.ts`, so it
can be dropped when Winston ships the feature.

## Requirements

Node.js. Winston does not run in browsers.
