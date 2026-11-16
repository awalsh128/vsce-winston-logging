import { HostTransport, type Host, type HostSink, type LogLevelOrOff } from "@awalsh128/winston-host";
import type TransportStream from "winston-transport";
import type * as vscode from "vscode";
import { fromVscodeLogLevel } from "./level";

/** A `HostSink` that writes to a VS Code `LogOutputChannel`, which adds its own timestamp and level. */
export function outputChannelSink(outputChannel: vscode.LogOutputChannel): HostSink {
  return {
    write: (level, message) => outputChannel[level](message),
    writeUnknown: (level, message) => outputChannel.appendLine(`[UNKNOWN/${level}] ${message}`),
  };
}

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
    sink: outputChannelSink(outputChannel),
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
 * timestamp and level, so the formatted message is written as is.
 */
export class OutputChannelTransport extends HostTransport {
  constructor({ outputChannel, ...opts }: OutputChannelTransportOptions) {
    super({ ...opts, sink: outputChannelSink(outputChannel) });
  }
}
