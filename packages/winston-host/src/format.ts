import * as util from "node:util";
import type { TransformableInfo } from "logform";
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
