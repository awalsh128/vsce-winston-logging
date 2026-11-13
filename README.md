# vsce-winston-logging

A customized [Winston](https://github.com/winstonjs/winston) logger for VS Code extensions. It writes to the extension's own log output channel and supports lazy logging.

- Writes to a `vscode.LogOutputChannel`, so lines get VS Code's timestamps, levels and filtering.
- Follows the channel's log level. Users change it with **Developer: Set Log Level...** or with `--log=<publisher>.<name>:<level>`, and it applies right away without a restart.
- Lazy methods (`debugLazy`, `traceLazy`, ...) only build a message when its level is enabled.
- Document loggers prefix each line with a workspace-relative path and line range.
- Can also log to a file.
- It's a normal Winston logger, so you can add other transports and use `child()` metadata.

## Install

```sh
npm install vsce-winston-logging
```

Requires VS Code 1.74 or later (`LogOutputChannel.onDidChangeLogLevel`).

## Usage

Create one logger for the extension and dispose of it when the extension deactivates.

```ts
import * as vscode from "vscode";
import { ExtensionLogger } from "vsce-winston-logging";

export let logger: ExtensionLogger;

export function activate(context: vscode.ExtensionContext) {
  logger = new ExtensionLogger({ name: "My Extension" });
  context.subscriptions.push(logger);

  logger.info("Activated");
}
```

### Levels

The levels are the same as `LogOutputChannel`'s: `error`, `warn`, `info`, `debug` and `trace`.

```ts
logger.error("Failed to parse", { error });
logger.warn("Falling back to defaults");
logger.info(`Loaded ${count} files`);
logger.debug("Cache miss");
logger.trace("Entering resolve()");
```

The logger starts at the channel's level and keeps following it. A channel set to **Off** silences the logger. You can also set the level from code, for example from a setting:

```ts
logger.setLevel("debug"); // or "off"
```

### Lazy logging

Use the lazy methods when building the message costs something, such as serializing a large object. The callback only runs when the level is enabled.

```ts
logger.traceLazy(() => `Response:\n${JSON.stringify(response, null, 2)}`);
logger.debugLazy(() => `Took ${benchmark.getDeltaAsText()}`);
```

There's one for each level (`errorLazy`, `warnLazy`, `infoLazy`, `debugLazy`, `traceLazy`), plus `logLazy(level, getMessage)`.

### Document loggers

`forDocument()` returns a child logger that prefixes lines with the document's workspace-relative path and an optional 1-based line range:

```ts
const docLogger = logger.forDocument(document.uri, new vscode.Range(2, 0, 6, 0));
docLogger.warn("Block is not sorted");
// [warning] src/app.ts[3:6]: Block is not sorted
```

For other context, use Winston's `child()`. The metadata goes to every line, and you can render it with a custom `format`.

```ts
const requestLogger = logger.child({ requestId });
```

### File logging

`setFileLogging()` adds a file transport that writes timestamped lines like `2026-11-13T12:00:00.000Z [info] message`. A relative path resolves against `baseDir`, which defaults to the first workspace folder (or the current directory when no folder is open). Calling it again replaces the file, and an empty path turns file logging off. It returns the absolute path being written to.

```ts
logger.setFileLogging(vscode.workspace.getConfiguration("myExt").get<string>("logFile"));

context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("myExt.logFile")) {
      logger.setFileLogging(vscode.workspace.getConfiguration("myExt").get<string>("logFile"));
    }
  })
);
```

### Errors

`logAndGetError()` logs anything thrown and returns it as an `Error`, so you can rethrow it:

```ts
try {
  await run();
} catch (err) {
  throw logAndGetError(logger, err);
}
```

### Timing

```ts
const benchmark = new Benchmark();
await scan();
logger.info(`Scan finished in ${benchmark.getDeltaAsText()}`); // "Scan finished in 42ms"
```

## Options

`new ExtensionLogger(options)`:

| Option   | Type                                  | Default         | Description                                                  |
| -------- | ------------------------------------- | --------------- | ------------------------------------------------------------ |
| `name`   | `string`                              | (required)      | Output channel name, usually the extension's display name.   |
| `show`   | `boolean`                             | `false`         | Reveal the output channel (without taking focus) on creation. |
| `format` | `(info: TransformableInfo) => string` | `defaultFormat` | Formats the body of each line, for the channel and the file. |

`defaultFormat` adds the document prefix from `forDocument()`. When a line has an `error` in its metadata, it dumps the whole info object.

## API

| Export                                | Description                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ExtensionLogger`                     | Logger that owns an output channel. Adds `setLevel`, `setFileLogging`, `forDocument` and `dispose`. |
| `LazyLogger`                          | Base `winston.Logger` with the VS Code levels and the lazy methods.                                 |
| `OutputChannelTransport`              | Winston transport that writes to a `LogOutputChannel`, if you want to build your own logger.         |
| `setLogLevel(logger, level)`          | Sets the level on any Winston logger and all its transports. `"off"` silences it.                    |
| `fromVscodeLogLevel(level)`           | Maps a `vscode.LogLevel` to a logger level (`Warning` becomes `warn`, `Off` becomes `off`).          |
| `logAndGetError(logger, err)`         | Logs a thrown value and returns it as an `Error`.                                                    |
| `defaultFormat(info)`                 | The default line formatter.                                                                          |
| `rangeText(range?)`                   | Formats a range as 1-based lines, such as `[3]` or `[3:6]`.                                          |
| `toLogText(value)`                    | Formats any value for a log line; strings pass through as they are.                                  |
| `Benchmark`                           | Stopwatch with `getDelta()` (ms) and `getDeltaAsText()` (`"42ms"`).                                  |
| `LOG_LEVELS`, `LogLevel`              | The level priorities and level names.                                                                |

## Development

```sh
npm install       # also installs the husky git hooks
npm run check     # typecheck and unit tests, with a stubbed `vscode` module
npm run build     # emits dist/
```

Commits follow Conventional Commits, which semantic-release uses to version releases. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the hooks, branches and npm publishing.

## License

[Apache-2.0](LICENSE)
