import type { Format, TransformableInfo } from "logform";
import * as winston from "winston";
import TransportStream from "winston-transport";
import type { Disposable } from "./benchmark";
import { defaultFormat, type Location } from "./format";
import { setLogLevel } from "./helpers";
import { LazyLogger } from "./lazy";
import { LOG_LEVELS, type LogLevel, type LogLevelOrOff } from "./levels";

/**
 * Everything the shared logger needs from the host it runs in. Each adapter implements it for its
 * host and never makes the shared package import the host's API.
 */
export interface Host {
  /**
   * Creates the transport that writes the host's lines: to an output channel, the workflow log, and
   * so on. Runs once, when the logger is created.
   *
   * @param format The format for the transport to use, made from the logger's `format` option.
   */
  createTransport(format: Format): TransportStream;
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

/** Options for `HostLogger`. */
export interface HostLoggerOptions {
  /** Formats the message body of each line. Defaults to `defaultFormat`. */
  format?: (info: TransformableInfo) => string;
  /**
   * Additional Winston transports, alongside the host's transport. They follow the host's level and are
   * closed when the logger is disposed. Each uses its own format, so `format` does not apply to them.
   */
  transports?: TransportStream[];
}

/**
 * Lazy Winston logger that writes through a host's transport and follows the host's level.
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
        host.createTransport(winston.format.printf(format)),
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

  /**
   * Creates a child logger whose lines carry a location, which `defaultFormat` prefixes and hosts
   * can use, such as for annotations.
   */
  forLocation(location: Location): LazyLogger {
    return this.child({ location });
  }

  /** Stops following the host's level, closes the transports and disposes the host. */
  dispose(): void {
    this.levelSubscription?.dispose();
    this.close();
    this.host.dispose?.();
  }
}
