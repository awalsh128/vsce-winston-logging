# vsce-winston-logging (deprecated)

> [!WARNING]
> This package was renamed to
> [`@awalsh128/winston-vscode`](https://github.com/awalsh128/vsce-winston-logging/tree/staging/packages/winston-vscode#readme).
> Version 2 only re-exports it, so existing imports keep working. Please switch to the new name.

```diff
-npm install vsce-winston-logging
+npm install @awalsh128/winston-vscode
```

```diff
-import { ExtensionLogger } from "vsce-winston-logging";
+import { ExtensionLogger } from "@awalsh128/winston-vscode";
```

One breaking change: `rangeText()` takes a `Location` (`{ line, endLine }`) instead of a
`vscode.Range`. Convert with `toLocation(uri, range)`.

This is an unofficial extension of Winston and is not affiliated with the Winston project.
