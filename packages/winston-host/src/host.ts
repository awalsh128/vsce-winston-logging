import type { TransformableInfo } from "logform";
import { LEVEL, MESSAGE } from "triple-beam";
import * as winston from "winston";
import TransportStream from "winston-transport";
import type { Disposable } from "./benchmark";
import { defaultFormat, type Location, getLocation } from "./format";
import { setLogLevel } from "./helpers";
import { LazyLogger } from "./lazy";
import { isLogLevel, LOG_LEVELS, type LogLevel, type LogLevelOrOff } from "./levels";

/** Where a host adapter's lines end up: an output channel, the workflow log, and so on. */
export interface HostSink {
  /**
   * Writes one formatted line.
   *
   * @param level The line's level.
   * @param message The formatted message body.
   * @param location The location the line is about, when its logger was made with one.
   */
  write(level: LogLevel, message: string, location?: Location): void;
  /** Writes a line whose level the logger doesn't know. Defaults to `write("info", ...)`. */
  writeUnknown?(level: string, message: string): void;
}

/**
 * Everything the shared logger needs from the host it runs in. Each adapter implements it for its
 * host and never makes the shared package import the host's API.
 */
export interface Host {
  /** Where the lines go. */
  readonly sink: HostSink;
  /** The level the host wants right now. Read once when the logger is created. */
  getLevel(): LogLevelOrOff;
  /**
   * Reports level changes made by the host while the logger lives, such as a user changing the log
   * level. Leave it out when the host's level never changes.
   *
   * @returns A subscription that stops the reports.
   */
  onLevelChange?(listener: (level: LogLevelOrOff) => void): Disposable;
  /** Releases what the host adapter holds, such as an output channel. Runs on logger disposal. */
  dispose?(): void;
}

/** Options for `HostTransport`. */
export interface HostTransportOptions extends TransportStream.TransportStreamOptions {
  /** The sink to write to. */
  sink: HostSink;
}

/** Winston transport that writes formatted lines to a `HostSink`. */
export class HostTransport extends TransportStream {
  private readonly sink: HostSink;

  constructor(opts: HostTransportOptions) {
    super(opts);
    this.sink = opts.sink;
  }

  override log(info: TransformableInfo, next: () => void): void {
    setImmediate(() => this.emit("logged", info));
    const message = String(info[MESSAGE] ?? info.message ?? "");
    const level = String(info[LEVEL] ?? info.level ?? "info");

    if (isLogLevel(level)) {
      this.sink.write(level, message, getLocation(info));
    } else if (this.sink.writeUnknown) {
      this.sink.writeUnknown(level, message);
    } else {
      this.sink.write("info", `[UNKNOWN/${level}] ${message}`);
    }
    next();
  }
}

/** Options for `HostLogger`. */
export interface HostLoggerOptions {
  /** Formats the message body of each line. Defaults to `defaultFormat`. */
  format?: (info: TransformableInfo) => string;
  /**
   * Additional Winston transports, alongside the host's sink. They follow the host's level and are
   * closed when the logger is disposed. Each uses its own format, so `format` does not apply to them.
   */
  transports?: TransportStream[];
}

/**
 * Lazy Winston logger that writes to a host's sink and follows the host's level.
 *
 * Host adapters create it directly, or extend it to add host-specific methods.
 */
export class HostLogger extends LazyLogger implements Disposable {
  /** The formatter applied to the host's lines. */
  protected readonly format_: (info: TransformableInfo) => string;
  private readonly host: Host;
  private readonly levelSubscription?: Disposable;

  constructor(host: Host, options: HostLoggerOptions = {}) {
    const format = options.format ?? defaultFormat;
    const level = host.getLevel();
    const winstonLevel: LogLevel = level === "off" ? "info" : level;
    super({
      level: winstonLevel,
      levels: { ...LOG_LEVELS },
      silent: level === "off",
      transports: [
        new HostTransport({
          sink: host.sink,
          format: winston.format.printf(format),
          level: winstonLevel,
        }),
        ...(options.transports ?? []),
      ],
    });
    // Start the extra transports at the host's level too.
    this.transports.forEach((t) => (t.level = winstonLevel));
    this.host = host;
    this.format_ = format;
    this.levelSubscription = host.onLevelChange?.((newLevel) => setLogLevel(this, newLevel));
  }

  /** Sets the level of the logger and its transports; `"off"` silences it. */
  setLevel(level: LogLevelOrOff): void {
    setLogLevel(this, level);
  }

  /** Stops following the host's level, closes the transports and disposes the host. */
  dispose(): void {
    this.levelSubscription?.dispose();
    this.close();
    this.host.dispose?.();
  }
}
