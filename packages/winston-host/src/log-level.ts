import type * as winston from "winston";
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
