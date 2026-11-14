import * as path from "node:path";
import { performance } from "node:perf_hooks";
import * as util from "node:util";
import type { TransformableInfo } from "logform";
import { LEVEL, MESSAGE } from "triple-beam";
import * as vscode from "vscode";
import * as winston from "winston";
import TransportStream from "winston-transport";

/** Log levels supported by the logger, matching the levels of a VS Code `LogOutputChannel`. */
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** Winston level priorities; lower is more severe. */
export const LOG_LEVELS: Readonly<Record<LogLevel, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * Maps a VS Code log level to a logger level. `Off` maps to `"off"`, which silences the logger.
 *
 * @param level The VS Code log level, such as the one reported by a `LogOutputChannel`.
 *
 * @returns The matching logger level, or `"off"`.
 */
export function fromVscodeLogLevel(level: vscode.LogLevel): LogLevel | "off" {
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

/** Formats a value for a log line; strings pass through unchanged. */
export function toLogText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false, getters: true });
}

/**
 * Formats a range as 1-based line numbers, such as `[3]` or `[3:7]`. Returns an empty string when
 * there is no range.
 */
export function rangeText(range?: vscode.Range): string {
  if (!range) {
    return "";
  }
  if (range.end.line === 0 || range.start.line === range.end.line) {
    return `[${range.start.line + 1}]`;
  }
  return `[${range.start.line + 1}:${range.end.line}]`;
}

/**
 * Default message format. Errors are dumped in full; other messages are prefixed with the document
 * path and range when the logger was made by `forDocument()`.
 */
export function defaultFormat(info: TransformableInfo): string {
  if (info.error) {
    return toLogText(info);
  }
  const location = info.documentPath ? `${info.documentPath}${info.range ?? ""}: ` : "";
  return `${location}${toLogText(info.message)}`;
}

/**
 * Creates a level method that logs through the logger it is called on. Child loggers from
 * `logger.child()` inherit these methods, so binding them to the parent would drop the child's
 * metadata.
 */
function createLeveledLog(level: LogLevel): winston.LeveledLogMethod {
  function logLevel(this: winston.Logger, message: string, ...meta: unknown[]): winston.Logger;
  function logLevel(this: winston.Logger, message: string): winston.Logger;
  function logLevel(this: winston.Logger, infoObject: object): winston.Logger;
  function logLevel(this: winston.Logger, ...args: unknown[]): winston.Logger {
    if (args.length === 1) {
      return this.log(level, args[0] as string);
    }
    const [message, ...meta] = args;
    return this.log(level, message as string, ...meta);
  }
  return logLevel;
}

/**
 * Winston logger with the VS Code log levels and lazy methods that only build a message when its
 * level is enabled.
 */
export class LazyLogger extends winston.Logger {
  error = createLeveledLog("error");
  warn = createLeveledLog("warn");
  info = createLeveledLog("info");
  debug = createLeveledLog("debug");
  trace = createLeveledLog("trace");

  /** Logs at error level, building the message only when the level is enabled. */
  errorLazy(getMessage: () => string): void {
    this.logLazy("error", getMessage);
  }

  /** Logs at warn level, building the message only when the level is enabled. */
  warnLazy(getMessage: () => string): void {
    this.logLazy("warn", getMessage);
  }

  /** Logs at info level, building the message only when the level is enabled. */
  infoLazy(getMessage: () => string): void {
    this.logLazy("info", getMessage);
  }

  /** Logs at debug level, building the message only when the level is enabled. */
  debugLazy(getMessage: () => string): void {
    this.logLazy("debug", getMessage);
  }

  /** Logs at trace level, building the message only when the level is enabled. */
  traceLazy(getMessage: () => string): void {
    this.logLazy("trace", getMessage);
  }

  /** Logs at the given level, building the message only when the level is enabled. */
  logLazy(level: LogLevel, getMessage: () => string): void {
    if (!this.silent && this.isLevelEnabled(level)) {
      this.log(level, getMessage());
    }
  }

  /** Creates a child logger that adds `meta` to every line it logs. */
  override child(meta: object): this {
    return super.child(meta) as this;
  }
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
export class OutputChannelTransport extends TransportStream {
  private readonly outputChannel: vscode.LogOutputChannel;

  constructor(opts: OutputChannelTransportOptions) {
    super(opts);
    this.outputChannel = opts.outputChannel;
  }

  override log(info: TransformableInfo, next: () => void): void {
    setImmediate(() => this.emit("logged", info));
    const message = String(info[MESSAGE] ?? info.message ?? "");
    const level = String(info[LEVEL] ?? info.level ?? "info");

    switch (level) {
      case "error":
        this.outputChannel.error(message);
        break;
      case "warn":
        this.outputChannel.warn(message);
        break;
      case "info":
        this.outputChannel.info(message);
        break;
      case "debug":
        this.outputChannel.debug(message);
        break;
      case "trace":
        this.outputChannel.trace(message);
        break;
      default:
        this.outputChannel.appendLine(`[UNKNOWN/${level}] ${message}`);
    }
    next();
  }
}

/**
 * Sets the level of a logger and all of its transports. `"off"` silences the logger until another
 * level is set.
 */
export function setLogLevel(logger: winston.Logger, level: LogLevel | "off"): void {
  const previous = logger.silent ? "off" : logger.level;
  if (level === "off") {
    logger.silent = true;
    return;
  }
  logger.silent = false;
  logger.level = level;
  logger.transports.forEach((t) => (t.level = level));
  if (previous !== level) {
    logger.info(`Log level changed from '${previous}' to '${level}'`);
  }
}

/** Logs an error and returns it as an `Error` so it can be thrown. */
export function logAndGetError(logger: winston.Logger, error: unknown): Error {
  let err: Error;
  if (error instanceof Error) {
    err = error;
  } else if (typeof error === "string") {
    err = new Error(error);
  } else {
    err = new Error(toLogText(error));
  }
  logger.error(err.message, { error: err, stack: err.stack });
  return err;
}

/** Simple stopwatch to measure elapsed time. */
export class Benchmark {
  private readonly startTime = performance.now();

  /** Gets the elapsed time since creation in milliseconds. */
  getDelta(): number {
    return performance.now() - this.startTime;
  }

  /** Gets the elapsed time since creation as text, such as `42ms`. */
  getDeltaAsText(): string {
    return `${this.getDelta().toFixed(0)}ms`;
  }
}

/** Options for `ExtensionLogger`. */
export interface ExtensionLoggerOptions {
  /** Output channel name, usually the extension's display name. */
  name: string;
  /** Reveals the output channel when the logger is created. Defaults to false. */
  show?: boolean;
  /** Formats the message body of each line. Defaults to `defaultFormat`. */
  format?: (info: TransformableInfo) => string;
  /**
   * The extension's configuration section, such as `"myExt"`. When set, the section's settings are
   * logged at debug level when the logger is created.
   */
  configSection?: string;
}

/**
 * Logger for a VS Code extension, writing to its own log output channel.
 *
 * The level follows the channel's level, so users can change it at runtime with "Developer: Set Log
 * Level..." or at startup with `--log=<publisher>.<name>:<level>`.
 */
export class ExtensionLogger extends LazyLogger implements vscode.Disposable {
  /** The output channel the logger writes to. */
  readonly outputChannel: vscode.LogOutputChannel;
  private readonly format_: (info: TransformableInfo) => string;
  private readonly levelSubscription: vscode.Disposable;

  /** Creates the output channel and a logger that writes to it. */
  constructor(options: ExtensionLoggerOptions) {
    const outputChannel = vscode.window.createOutputChannel(options.name, { log: true });
    const format = options.format ?? defaultFormat;
    const level = fromVscodeLogLevel(outputChannel.logLevel);
    const winstonLevel = level === "off" ? "info" : level;
    super({
      level: winstonLevel,
      levels: { ...LOG_LEVELS },
      silent: level === "off",
      transports: [
        new OutputChannelTransport({
          outputChannel,
          format: winston.format.printf(format),
          level: winstonLevel,
        }),
      ],
    });
    this.outputChannel = outputChannel;
    this.format_ = format;
    // The channel's event covers both its own level and the global level it follows;
    // vscode.env.onDidChangeLogLevel only reports the global level.
    this.levelSubscription = outputChannel.onDidChangeLogLevel((newLevel) =>
      setLogLevel(this, fromVscodeLogLevel(newLevel))
    );
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
    this.transports
      .filter((t) => t instanceof winston.transports.File)
      .forEach((t) => {
        this.remove(t);
        // remove() only unpipes the transport, so close it to release the file handle.
        t.close?.();
      });

    if (!filepath || filepath.trim() === "") {
      this.info("File logging disabled");
      return undefined;
    }

    const base = baseDir ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const filename = path.resolve(base, filepath);
    this.add(
      new winston.transports.File({
        filename,
        level: this.level,
        format: winston.format.printf(
          (info) => `${info.timestamp ?? new Date().toISOString()} [${info.level}] ${this.format_(info)}`
        ),
      })
    );
    this.info(`File logging enabled\n  path: "${filename}"\n  level: "${this.level}"`);
    return filename;
  }

  /** Sets the level of the logger and its transports; `"off"` silences it. */
  setLevel(level: LogLevel | "off"): void {
    setLogLevel(this, level);
  }

  /**
   * Creates a child logger whose lines are prefixed with a document's workspace-relative path and
   * an optional line range, such as `src/a.ts[3:7]: message`.
   */
  forDocument(uri: vscode.Uri, range?: vscode.Range): LazyLogger {
    return this.child({
      documentPath: vscode.workspace.asRelativePath(uri),
      range: rangeText(range),
    });
  }

  /** Stops following the channel's level, closes transports and disposes the output channel. */
  dispose(): void {
    this.levelSubscription.dispose();
    this.close();
    this.outputChannel.dispose();
  }
}
