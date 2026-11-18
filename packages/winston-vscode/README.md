<p align="center">
  <img src="https://raw.githubusercontent.com/awalsh128/winston-host-adapters/main/images/logo.png" alt="Winston VS Code logging logo" width="128" height="128">
</p>

<h1 align="center">Winston for VS Code</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@awalsh128/winston-vscode"><img src="https://img.shields.io/npm/v/@awalsh128/winston-vscode?label=npm&color=%2314b8a6" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@awalsh128/winston-vscode"><img src="https://img.shields.io/npm/dm/@awalsh128/winston-vscode?label=npm%20downloads&color=blueviolet" alt="npm downloads"></a>
  <a href="https://github.com/awalsh128/winston-host-adapters/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/winston-host-adapters/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/awalsh128/winston-host-adapters/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

A [Winston](https://github.com/winstonjs/winston) logger for VS Code extensions. Part of [winston host adapters](https://github.com/awalsh128/winston-host-adapters#readme), and an unofficial extension of Winston, not affiliated with the Winston project.

- 📺 **Output channel logging**: writes to the extension's own log output channel, with VS Code's
  timestamps, level labels, and filtering.
- 🎚️ **Follows the channel's level**: users change how much it logs with
  **Developer: Set Log Level...** or `--log=<publisher>.<name>:<level>`, without a restart.
- 💤 **Lazy logging**: lazy methods build a message only when its level is enabled, so expensive
  messages cost nothing when they are not logged.
- 📄 **Document loggers**: prefix each line with a workspace-relative file and line range, such as
  `src/app.ts[3:6]: `.
- 💾 **File logging**: lines can also go to a file, which can be changed or turned off at runtime.
- 🧩 **Plain Winston**: it is a normal Winston logger, so other transports and `child()` metadata
  work as usual.

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/awalsh128)

If you find this project useful, please consider [sponsoring it](https://github.com/sponsors/awalsh128) and show some ❤️ for open source maintainers.

```sh
npm install @awalsh128/winston-vscode
```

The package re-exports everything from [`@awalsh128/winston-host`](https://github.com/awalsh128/winston-host-adapters/tree/staging/packages/winston-host#readme), such as `LazyLogger`, `Benchmark` and `logAndGetError`, so one import covers it. It ships CommonJS with TypeScript types. It runs in the extension host and needs VS Code
1.74 or later, the first version with `LogOutputChannel.onDidChangeLogLevel`.

## Usage

Create one logger when the extension activates, and add it to the subscriptions so it is disposed
of on deactivation:

```ts
import * as vscode from "vscode";
import { ExtensionLogger } from "@awalsh128/winston-vscode";

export let logger: ExtensionLogger;

export function activate(context: vscode.ExtensionContext) {
  // The extension's displayName from package.json, such as "My Extension".
  logger = new ExtensionLogger({
    name: context.extension.packageJSON.displayName,
    configSection: "myExt",
  });
  context.subscriptions.push(logger);

  logger.info("Activated");

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      const docLogger = logger.forDocument(document.uri, new vscode.Range(2, 0, 6, 0));
      docLogger.warn("Block is not sorted");
    }),
  );
}
```

The **My Extension** output channel then shows, at the default `info` level:

```text
2026-11-13 12:00:00.000 [info] Activated
2026-11-13 12:00:00.002 [warning] src/app.ts[3:6]: Block is not sorted
```

At `Debug` or `Trace`, the channel also starts with the logger's options and the `myExt` settings:

```text
2026-11-13 12:00:00.000 [debug] Logger created
  name: "My Extension"
  level: "debug"
  show: false
  format: default
  configSection: "myExt"
2026-11-13 12:00:00.001 [debug] Settings for "myExt":
{
  "logFile": "logs/my-extension.log"
}
```

## API

The full API reference for each release is at [awalsh128.com/winston-host-adapters/winston-vscode](https://awalsh128.com/winston-host-adapters/winston-vscode/).
See all of my published APIs at [awalsh128.com/api](https://awalsh128.com/api/).

### `new ExtensionLogger(options)`

Creates a log output channel and a logger that writes to it. The logger starts at the channel's
level and follows it when the user changes it; a channel set to `Off` silences the logger.
`ExtensionLoggerOptions`:

- `name`: the output channel name, usually the extension's display name.
- `show`: reveals the channel, without taking focus, when the logger is created. Off by default.
- `format`: `(info) => string`, which formats the body of each line for the channel and the file.
  Defaults to `defaultFormat`.
- `transports`: additional Winston transports, written to alongside the channel. They follow the
  channel's level, are closed on `dispose()`, and use their own `format`.
- `mapLevel`: `(vscodeLevel) => level | "off"`, which replaces how the channel's VS Code level maps to a logger level. Defaults to `fromVscodeLogLevel`.
- `configSection`: the extension's configuration section, such as `"myExt"`. When set, the
  section's settings are logged at `debug` level when the logger is created.

At `debug` level, the logger logs its own options when it is created. Neither line is built unless
`debug` is enabled.

The levels are the `LogOutputChannel` levels, from most to least severe: `error`, `warn`, `info`,
`debug`, and `trace`. Each has a method taking a message and optional metadata, as in Winston:

```ts
logger.error("Failed to parse", { error });
logger.trace("Entering resolve()");
```

`ExtensionLogger` also has:

- `outputChannel`: the `vscode.LogOutputChannel` it writes to.
- `setLevel(level)`: sets the level from code, such as from a setting. `"off"` silences the logger.
  A later change to the channel's level replaces it.
- `forDocument(uri, range?)`: a child logger whose lines start with the document's
  workspace-relative path and the range's 1-based lines, such as `src/app.ts[3:6]: `.
- `setFileLogging(filepath?, baseDir?)`: see [File logging](#file-logging).
- `dispose()`: stops following the channel's level, closes the transports, and disposes of the
  channel.

### Lazy logging

Level methods take a function as the message and call it only when the level is enabled, so
expensive messages cost nothing when they are not logged. Anything after the function is metadata.
`errorLazy`, `warnLazy`, `infoLazy`, `debugLazy`, and `traceLazy` do the same with a function that
returns a string, and `logLazy(level, getMessage)` takes the level as an argument.

```ts
logger.trace(() => `Response:\n${JSON.stringify(response, null, 2)}`);
logger.debug(() => buildMessage(), { requestId });
logger.traceLazy(() => `Response:\n${JSON.stringify(response, null, 2)}`); // the same
```

The function form is [Winston PR #2626](https://github.com/winstonjs/winston/pull/2626). See
[`@awalsh128/winston-host`](https://github.com/awalsh128/winston-host-adapters/tree/staging/packages/winston-host#lazy-logging)
for how this package supplies it until Winston does.

The lazy methods are on `LazyLogger`, which `ExtensionLogger` extends, so loggers from
`forDocument()` and `child()` have them too.

### File logging

`setFileLogging(filepath?, baseDir?)` adds a file transport that writes lines such as
`2026-11-13T12:00:00.000Z [info] Activated`. A relative `filepath` resolves against `baseDir`, which
defaults to the first workspace folder, or the current directory when no folder is open. Calling it
again replaces the file, and an empty or undefined `filepath` turns file logging off. It returns the
absolute path written to, or `undefined` when file logging is off.

```ts
const setting = () => vscode.workspace.getConfiguration("myExt").get<string>("logFile");

logger.setFileLogging(setting());
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("myExt.logFile")) {
      logger.setFileLogging(setting());
    }
  }),
);
```

### `logAndGetError(logger, error)`

Logs a thrown value at `error` level and returns it as an `Error` to rethrow. Strings become the
error's message, and other values are formatted with `toLogText`. The `Error` is attached to the
line's metadata, so `defaultFormat` logs the whole error with its stack.

```ts
try {
  await run();
} catch (err) {
  throw logAndGetError(logger, err);
}
```

### `Benchmark`

A stopwatch started when it is created. `getDelta()` returns the elapsed milliseconds and
`getDeltaAsText()` returns them as text, such as `"42ms"`.

```ts
const benchmark = new Benchmark();
await scan();
logger.info(`Scan finished in ${benchmark.getDeltaAsText()}`);
```

### `DisposableBenchmark`

A `Benchmark` that logs when it is disposed, such as at the end of a scope with `using`. The lambda
returns the level and the message, and the elapsed time is appended to it. The lambda runs only on
disposal, and only when the logger is not silent, and nothing is logged when its level is disabled.

```ts
async function scan() {
  using _ = new DisposableBenchmark(logger, () => ({ level: "debug", message: "Scan finished" }));
  await doScan();
} // Logs "Scan finished (42ms)" at debug level
```

### Formatting

- `defaultFormat(info)`: the default line body. It prefixes the message with the document from
  `forDocument()`, and logs the whole info object when the metadata has an `error`.
- `rangeText(range?)`: formats a `vscode.Range` as 1-based lines, such as `[3]` or `[3:6]`, or `""`
  without a range.
- `toLogText(value)`: formats any value with `util.inspect`; strings are returned as they are.

### Building your own logger

- `LazyLogger`: a `winston.Logger` with the VS Code levels as methods and the lazy methods. Pass it
  Winston `LoggerOptions` with `levels: LOG_LEVELS`.
- `OutputChannelTransport`: a Winston transport that writes to a `LogOutputChannel` given as
  `outputChannel`, calling the channel method for each level.
- `setLogLevel(logger, level)`: sets the level of any Winston logger and all of its transports.
  `"off"` silences it.
- `fromVscodeLogLevel(level)`: maps a `vscode.LogLevel` to a level name, so `Warning` becomes
  `warn` and `Off` becomes `"off"`.
- `LOG_LEVELS` and `LogLevel`: the level priorities and the level name type.

## Limitations

- Levels follow the output channel. If you call `setLevel()`, the next change the user makes to the
  channel's level replaces it.
- `forDocument()` is only on `ExtensionLogger`, not on the child loggers it returns. For more
  context on a document logger, use `child()`, and render the metadata with a custom `format`.
- `LogOutputChannel` adds its own timestamp and level, so `format` only sets the rest of the line.

## How it works

`ExtensionLogger` is a `winston.Logger` whose levels are those of `LogOutputChannel`.
`OutputChannelTransport` passes each formatted line to the channel method for its level, so the
lines get VS Code's timestamps, level labels, and filtering. The logger listens to the channel's
`onDidChangeLogLevel`, which reports both the channel's own level and the global level it follows,
and sets the logger and every transport to the new level. The level methods log through the logger
they are called on rather than being bound to one, so child loggers keep their metadata.

## Contributing

Setup, the git hooks, commit conventions, and releases are in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0
