/*
 * Lazy logging, kept in this one file with no dependency on the rest of the package except the
 * level type, so it can be proposed to Winston or dropped without touching anything else.
 */
import * as winston from "winston";
import type { LogLevel } from "./levels";

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
 * Winston logger with the `error`, `warn`, `info`, `debug` and `trace` levels and lazy methods that
 * only build a message when its level is enabled.
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
