import * as util from "node:util";
import type { TransformableInfo } from "logform";
import type * as winston from "winston";
import { getLocation, rangeText } from "./location";

/** Formats a value for a log line; strings pass through unchanged. */
export function toLogText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false, getters: true });
}

/**
 * Default message format. Errors are dumped in full; other messages are prefixed with their
 * location's path and lines when the logger was made with a `location`.
 */
export function defaultFormat(info: TransformableInfo): string {
  if (info.error) {
    return toLogText(info);
  }
  const location = getLocation(info);
  const prefix = location ? `${location.path}${rangeText(location)}: ` : "";
  return `${prefix}${toLogText(info.message)}`;
}

/** Message format without the location prefix, for hosts that show the location themselves. */
export function plainFormat(info: TransformableInfo): string {
  return info.error ? toLogText(info) : toLogText(info.message);
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
