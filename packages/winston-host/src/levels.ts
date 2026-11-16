/** Log levels supported by the loggers, the same set as a VS Code `LogOutputChannel`. */
export type LogLevel = "error" | "warn" | "info" | "debug" | "trace";

/** A level, or `"off"`, which silences a logger. */
export type LogLevelOrOff = LogLevel | "off";

/** Winston level priorities; lower is more severe. */
export const LOG_LEVELS: Readonly<Record<LogLevel, number>> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/** Whether a string is one of the logger's levels. */
export function isLogLevel(level: string): level is LogLevel {
  return Object.hasOwn(LOG_LEVELS, level);
}
