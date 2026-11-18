import type * as winston from "winston";
import { toLogText } from "./format";

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
