import * as path from "node:path";
import { HostLogger, type LogLevelOrOff } from "@awalsh128/winston-host";
import type { TransformableInfo } from "logform";
import * as vscode from "vscode";
import * as winston from "winston";
import type TransportStream from "winston-transport";
import { fromVscodeLogLevel } from "./level";
import { toLocation } from "./location";
import { outputChannelHost } from "./output-channel";
import type { LazyLogger } from "@awalsh128/winston-host";

/** Options for `ExtensionLogger`. */
export interface ExtensionLoggerOptions {
  /** Output channel name, usually the extension's display name. */
  name: string;
  /** Reveals the output channel when the logger is created. Defaults to false. */
  show?: boolean;
  /** Formats the message body of each line. Defaults to `defaultFormat`. */
  format?: (info: TransformableInfo) => string;
  /**
   * Additional Winston transports, alongside the output channel. They follow the channel's level
   * like the output channel does, and are closed when the logger is disposed. Each uses its own
   * format, so `format` does not apply to them.
   */
  transports?: TransportStream[];
  /**
   * The extension's configuration section, such as `"myExt"`. When set, the section's settings are
   * logged at debug level when the logger is created.
   */
  configSection?: string;
  /** Maps the channel's VS Code level to a logger level. Defaults to `fromVscodeLogLevel`. */
  mapLevel?: (level: vscode.LogLevel) => LogLevelOrOff;
}

/**
 * Logger for a VS Code extension, writing to its own log output channel.
 *
 * The level follows the channel's level, so users can change it at runtime with "Developer: Set Log
 * Level..." or at startup with `--log=<publisher>.<name>:<level>`.
 */
export class ExtensionLogger extends HostLogger implements vscode.Disposable {
  /** The output channel the logger writes to. */
  readonly outputChannel: vscode.LogOutputChannel;
  /** The transport added by `setFileLogging`; transports from the options are left alone. */
  private fileTransport?: winston.transports.FileTransportInstance;

  /** Creates the output channel and a logger that writes to it. */
  constructor(options: ExtensionLoggerOptions) {
    const outputChannel = vscode.window.createOutputChannel(options.name, { log: true });
    super(outputChannelHost(outputChannel, options.mapLevel ?? fromVscodeLogLevel), {
      format: options.format,
      transports: options.transports,
    });
    this.outputChannel = outputChannel;
    if (options.show) {
      outputChannel.show(true);
    }
    this.logSettings(options);
  }

  /** Logs the logger's options and, when a section is given, the extension's settings. */
  private logSettings(options: ExtensionLoggerOptions): void {
    this.debugLazy(
      () =>
        `Logger created\n  name: "${options.name}"\n  level: "${this.level}"\n` +
        `  show: ${options.show ?? false}\n  format: ${options.format ? "custom" : "default"}\n` +
        `  configSection: ${options.configSection === undefined ? "none" : `"${options.configSection}"`}`
    );
    const section = options.configSection;
    if (section) {
      // JSON drops the configuration object's methods (get, has, inspect, update).
      this.debugLazy(
        () =>
          `Settings for "${section}":\n` +
          JSON.stringify(vscode.workspace.getConfiguration(section), null, 2)
      );
    }
  }

  /**
   * Sets or removes file logging. Replaces any file previously set by this method.
   *
   * @param filepath File to log to; relative paths resolve against `baseDir`. Empty or undefined
   *   disables file logging.
   * @param baseDir Directory that relative paths resolve against. Defaults to the first workspace
   *   folder, or the current directory when no folder is open.
   *
   * @returns The absolute path logged to, or undefined if file logging is disabled.
   */
  setFileLogging(filepath?: string, baseDir?: string): string | undefined {
    if (this.fileTransport) {
      this.remove(this.fileTransport);
      // remove() only unpipes the transport, so close it to release the file handle.
      this.fileTransport.close?.();
      this.fileTransport = undefined;
    }

    if (!filepath || filepath.trim() === "") {
      this.info("File logging disabled");
      return undefined;
    }

    const base = baseDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const filename = path.resolve(base, filepath);
    this.fileTransport = new winston.transports.File({
      filename,
      level: this.level,
      format: winston.format.printf(
        (info) => `${info.timestamp ?? new Date().toISOString()} [${info.level}] ${this.format_(info)}`,
      ),
    });
    this.add(this.fileTransport);
    this.info(`File logging enabled\n  path: "${filename}"\n  level: "${this.level}"`);
    return filename;
  }

  /**
   * Creates a child logger whose lines are prefixed with a document's workspace-relative path and
   * an optional line range, such as `src/a.ts[3:7]: message`.
   */
  forDocument(uri: vscode.Uri, range?: vscode.Range): LazyLogger {
    return this.forLocation(toLocation(uri, range));
  }
}
