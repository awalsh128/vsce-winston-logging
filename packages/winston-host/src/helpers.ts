import type * as winston from "winston";
import { toLogText } from "./format";
import type { LogLevelOrOff } from "./levels";

/**
 * Sets the level of a logger and all of its transports. `"off"` silences the logger until another
 * level is set.
 */
export function setLogLevel(logger: winston.Logger, level: LogLevelOrOff): void {
  const previous: string = logger.silent ? "off" : logger.level;
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
