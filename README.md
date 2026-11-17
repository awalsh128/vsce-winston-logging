<p align="center">
  <img src="images/logo.png" alt="Winston host adapters logo" width="128" height="128">
</p>

<h1 align="center">Winston Host Adapters</h1>

<p align="center">
  <a href="https://github.com/awalsh128/winston-host-adapters/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/winston-host-adapters/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/awalsh128/winston-host-adapters/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

[Winston](https://github.com/winstonjs/winston) loggers for the places your code runs: VS Code
extensions, GitHub Actions workflows, or any host you give a small adapter to.

> [!NOTE]
> This is an unofficial extension of Winston and is not affiliated with the Winston project.

- 💤 **Lazy logging**: `logger.debug(() => message)` builds a message only when its level is enabled.
- 🔌 **One small host interface**: a sink, the host's level, and a dispose hook. An adapter is about
  a page of code.
- 🎚️ **Follows the host's level**: a VS Code output channel's level, or the runner's debug setting.
- 🧩 **Plain Winston**: Winston stays the only engine, so other transports and `child()` metadata
  work as usual.

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-db61a2?style=for-the-badge&logo=githubsponsors&logoColor=white)](https://github.com/sponsors/awalsh128)

If you find this project useful, please consider [sponsoring it](https://github.com/sponsors/awalsh128) and show some ❤️ for open source maintainers.

## Quick Start

In a GitHub Actions step, such as a JavaScript action:

```sh
npm install @awalsh128/winston-github-actions @actions/core
```

```ts
import { ActionsLogger } from "@awalsh128/winston-github-actions";

const logger = new ActionsLogger();
logger.info("Scanning");
logger.forLocation({ path: "src/app.ts", line: 3 }).warn("Block is not sorted"); // an annotation

logger.debug(() => `Config: ${JSON.stringify(config)}`); // built only when debug logging is on

const group = logger.group("Build"); // a collapsible group in the workflow log
build();
group.dispose(); // ends the group and logs "Build (42ms)"
```

In a VS Code extension, see the [`winston-vscode` README](packages/winston-vscode#readme).

## Packages

| Package | For | Install |
| --- | --- | --- |
| [`@awalsh128/winston-host`](packages/winston-host#readme) | The shared base. Depends only on Winston and never imports `vscode`. | `npm install @awalsh128/winston-host` |
| [`@awalsh128/winston-vscode`](packages/winston-vscode#readme) | VS Code extensions: `ExtensionLogger`, `OutputChannelTransport`, `forDocument`. | `npm install @awalsh128/winston-vscode` |
| [`@awalsh128/winston-github-actions`](packages/winston-github-actions#readme) | GitHub Actions: annotations, groups, debug levels, secret masking. | `npm install @awalsh128/winston-github-actions` |
| `vsce-winston-logging` | Deprecated name of `winston-vscode`, kept so existing imports work. | Use `@awalsh128/winston-vscode` instead |

## Writing an adapter

An adapter implements `Host` from `@awalsh128/winston-host` and passes it to `HostLogger`:

```ts
import { HostLogger, type Host } from "@awalsh128/winston-host";

const host: Host = {
  sink: { write: (level, message, location) => myHost.log(level, message) },
  getLevel: () => "info",
  onLevelChange: (listener) => myHost.onLevel(listener), // optional
  dispose: () => myHost.close(), // optional
};
const logger = new HostLogger(host);
```

Levels, `Location`, and the lazy methods are the same everywhere. Winston is Node-only, so browsers
are not supported.

## Migrating from `vsce-winston-logging`

`vsce-winston-logging@2` re-exports `@awalsh128/winston-vscode`, so existing imports keep working.
To migrate, change the dependency and the import:

```diff
-import { ExtensionLogger } from "vsce-winston-logging";
+import { ExtensionLogger } from "@awalsh128/winston-vscode";
```

One breaking change: `rangeText()` takes a `Location` (`{ line, endLine }`) instead of a
`vscode.Range`. Convert with `toLocation(uri, range)`. `ExtensionLogger`, `forDocument()` and the
log output are unchanged.

## API

The API reference for each package is at
[awalsh128.com/winston-host-adapters](https://awalsh128.com/winston-host-adapters/). See all of my
published APIs at [awalsh128.com/api](https://awalsh128.com/api/). Release notes are on the
[Releases](https://github.com/awalsh128/winston-host-adapters/releases) page, and bugs go in
[Issues](https://github.com/awalsh128/winston-host-adapters/issues).

## Testing

```sh
npm install
npm run check   # build, typecheck and test every package
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow.
