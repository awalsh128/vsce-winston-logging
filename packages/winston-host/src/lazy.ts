/*
 * Lazy logging, kept in this one file with no dependency on the rest of the package except the
 * level definitions, so it can be dropped without touching anything else.
 *
 * It follows Winston PR #2626 (https://github.com/winstonjs/winston/pull/2626): a level method takes
 * a function as its first argument and calls it only when the level is enabled, using its result as
 * the message. Winston releases don't have that yet, so:
 *
 * - Compile time: the module augmentation below adds the function overload to Winston's own
 *   `LeveledLogMethod` type, so `logger.debug(() => message, meta)` type-checks.
 * - Run time: `LazyLogger` runs the function itself, unless the installed Winston already has the
 *   feature, in which case it uses Winston's own level methods for a lone function. A function
 *   followed by metadata always goes through the shim: the PR's first version drops that metadata.
 *
 * When Winston ships the feature, delete this file's shim (`shimLazy`, the probe, and the
 * augmentation) and keep the `*Lazy` methods as thin aliases.
 */
import * as winston from "winston";
import { LOG_LEVELS, type LogLevel } from "./levels";

declare module "winston" {
  interface LeveledLogMethod {
    /**
     * Lazy logging: `getMessage` is called only when the level is enabled, and its result is the
     * message. Any further arguments are metadata, as in `logger.info(message, meta)`.
     */
    (getMessage: () => unknown, ...meta: any[]): winston.Logger;
  }
}

type LevelMethod = winston.LeveledLogMethod;

let nativeLevelMethods: Partial<Record<LogLevel, LevelMethod>> | undefined | null = null;

/**
 * Winston's own level methods, when the installed Winston already accepts a function as the message
 * (PR #2626); otherwise undefined. It asks a throwaway logger to log a function and looks at what
 * reaches the format: the function's result with the feature, the function itself without.
 *
 * @param create Winston's `createLogger`; a parameter so tests can stand in for a Winston that has
 *   the feature.
 */
export function findNativeLazy(
  create: typeof winston.createLogger = winston.createLogger,
): Partial<Record<LogLevel, LevelMethod>> | undefined {
  try {
    let seen: unknown;
    const probe = create({
      levels: { ...LOG_LEVELS },
      level: "error",
      // A silent transport, so the probe doesn't warn about having none.
      transports: [new winston.transports.Console({ silent: true })],
      format: winston.format((info) => {
        seen = info.message;
        return false;
      })(),
    });
    probe.error((() => "native") as never);
    if (seen !== "native") {
      return undefined;
    }
    // The level methods live on the prototype of the logger createLogger made, and take `this`.
    const prototype = Object.getPrototypeOf(probe) as Record<string, unknown>;
    const methods: Partial<Record<LogLevel, LevelMethod>> = {};
    for (const level of Object.keys(LOG_LEVELS) as LogLevel[]) {
      if (typeof prototype[level] !== "function") {
        return undefined;
      }
      methods[level] = prototype[level] as LevelMethod;
    }
    return methods;
  } catch {
    return undefined;
  }
}

/** Whether lazy logging uses the installed Winston's own implementation instead of the shim. */
export function usesNativeLazy(): boolean {
  nativeLevelMethods = nativeLevelMethods === null ? (findNativeLazy() ?? undefined) : nativeLevelMethods;
  return nativeLevelMethods !== undefined;
}

/** Forgets what `usesNativeLazy()` found, so the next call probes again. For tests. */
export function resetNativeLazy(): void {
  nativeLevelMethods = null;
}

/**
 * The shim: calls the function and logs its result in its place, keeping any metadata after it.
 * Unlike Winston PR #2626's first version, extra arguments are kept and an `undefined` result is
 * passed on as is, so formats and transports decide how to show it.
 */
function shimLazy(logger: winston.Logger, level: LogLevel, args: unknown[]): winston.Logger {
  const [getMessage, ...meta] = args as [() => unknown, ...unknown[]];
  const message = getMessage();
  return meta.length === 0 ? logger.log(level, message as string) : logger.log(level, message as string, ...meta);
}

/**
 * Creates a level method that logs through the logger it is called on. Child loggers from
 * `logger.child()` inherit these methods, so binding them to the parent would drop the child's
 * metadata.
 */
function createLeveledLog(level: LogLevel): LevelMethod {
  function logLevel(this: winston.Logger, ...args: unknown[]): winston.Logger {
    if (typeof args[0] === "function") {
      // The feature this implements skips the function when the level is off; a silent logger is
      // off for every level, which Winston's own check doesn't take into account.
      if (this.silent || !this.isLevelEnabled(level)) {
        return this;
      }
      usesNativeLazy();
      // PR #2626's first version replaces every argument with the function's result, which drops
      // any metadata after the function, so Winston's method only gets the case it handles well.
      const native = args.length === 1 ? nativeLevelMethods?.[level] : undefined;
      return native ? (native as (...a: unknown[]) => winston.Logger).apply(this, args) : shimLazy(this, level, args);
    }
    if (args.length === 1) {
      return this.log(level, args[0] as string);
    }
    const [message, ...meta] = args;
    return this.log(level, message as string, ...meta);
  }
  return logLevel as LevelMethod;
}

/**
 * Winston logger with the `error`, `warn`, `info`, `debug` and `trace` levels. Its level methods
 * take a function as the message and only call it when the level is enabled:
 *
 * ```ts
 * logger.debug(() => `Response:\n${JSON.stringify(response, null, 2)}`);
 * logger.debug(() => buildMessage(), { requestId });
 * ```
 *
 * The `*Lazy` methods do the same with a function that returns a string.
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
    this[level](getMessage);
  }

  /** Creates a child logger that adds `meta` to every line it logs. */
  override child(meta: object): this {
    return super.child(meta) as this;
  }
}
