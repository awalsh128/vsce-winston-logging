import { defaultFormat, isLogLevel, type Host, type LogLevelOrOff } from "@awalsh128/winston-host";
import type { TransformableInfo } from "logform";
import { LEVEL, MESSAGE } from "triple-beam";
import type * as vscode from "vscode";
import * as winston from "winston";
import TransportStream from "winston-transport";
import { fromVscodeLogLevel } from "./level";

/**
 * A `Host` for a `LogOutputChannel`: it follows the channel's level, which covers both its own level
 * and the global one, and disposes the channel with the logger.
 *
 * @param mapLevel Maps the channel's VS Code level to a logger level.
 */
export function outputChannelHost(
  outputChannel: vscode.LogOutputChannel,
  mapLevel: (level: vscode.LogLevel) => LogLevelOrOff = fromVscodeLogLevel,
): Host {
  return {
    createTransport: (format) => new OutputChannelTransport({ outputChannel, format }),
    getLevel: () => mapLevel(outputChannel.logLevel),
    // vscode.env.onDidChangeLogLevel only reports the global level.
    onLevelChange: (listener) => outputChannel.onDidChangeLogLevel((level) => listener(mapLevel(level))),
    dispose: () => outputChannel.dispose(),
  };
}

/** Options for `OutputChannelTransport`. */
export interface OutputChannelTransportOptions extends TransportStream.TransportStreamOptions {
  /** The channel to write to. */
  outputChannel: vscode.LogOutputChannel;
}

/**
 * Winston transport that writes to a VS Code `LogOutputChannel`. The channel adds its own
 * timestamp and level, so the formatted message is written as is. Lines at a level the logger
 * doesn't know are written as `[UNKNOWN/level] message`.
 *
 * It works with any Winston logger, so there is no need for `ExtensionLogger`.
 */
export class OutputChannelTransport extends TransportStream {
  private readonly outputChannel: vscode.LogOutputChannel;

  constructor({ outputChannel, ...opts }: OutputChannelTransportOptions) {
    // Without its own format, a transport would get the logger's, which is JSON by default.
    super({ ...opts, format: opts.format ?? winston.format.printf(defaultFormat) });
    this.outputChannel = outputChannel;
  }

  override log(info: TransformableInfo, next: () => void): void {
    setImmediate(() => this.emit("logged", info));
    const message = String(info[MESSAGE] ?? info.message ?? "");
    const level = String(info[LEVEL] ?? info.level ?? "info");
    if (isLogLevel(level)) {
      this.outputChannel[level](message);
    } else {
      this.outputChannel.appendLine(`[UNKNOWN/${level}] ${message}`);
    }

    next();
  }
}
