import type { LogLevelOrOff } from "@awalsh128/winston-host";
import * as vscode from "vscode";

/**
 * Maps a VS Code log level to a logger level. `Off` maps to `"off"`, which silences the logger.
 *
 * @param level The VS Code log level, such as the one reported by a `LogOutputChannel`.
 *
 * @returns The matching logger level, or `"off"`.
 */
export function fromVscodeLogLevel(level: vscode.LogLevel): LogLevelOrOff {
  switch (level) {
    case vscode.LogLevel.Off:
      return "off";
    case vscode.LogLevel.Trace:
      return "trace";
    case vscode.LogLevel.Debug:
      return "debug";
    case vscode.LogLevel.Warning:
      return "warn";
    case vscode.LogLevel.Error:
      return "error";
    default:
      return "info";
  }
}
