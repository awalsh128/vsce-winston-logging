# @awalsh128/winston-host

The shared base of the [winston host adapters](https://github.com/awalsh128/vsce-winston-logging#readme).
It depends only on [Winston](https://github.com/winstonjs/winston) and never imports `vscode`. This is
an unofficial extension of Winston and is not affiliated with the Winston project.

Use it to write an adapter for a new host. For VS Code or GitHub Actions, install
[`@awalsh128/winston-vscode`](https://github.com/awalsh128/vsce-winston-logging/tree/staging/packages/winston-vscode#readme)
or [`@awalsh128/winston-github-actions`](https://github.com/awalsh128/vsce-winston-logging/tree/staging/packages/winston-github-actions#readme),
which re-export this package.

## What's in it

| Export | What it is |
| --- | --- |
| `Host`, `HostSink` | What an adapter implements: where lines go, the host's level, level changes, disposal. |
| `HostLogger`, `HostTransport` | The Winston logger and transport that use a `Host`. `forLocation(location)` makes a child logger. |
| `LazyLogger` | Winston logger with `errorLazy`, `warnLazy`, `infoLazy`, `debugLazy`, `traceLazy` and `logLazy`. Self-contained in `lazy.ts`. |
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

## Requirements

Node.js. Winston does not run in browsers.
