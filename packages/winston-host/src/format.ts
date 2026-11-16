import * as util from "node:util";
import type { TransformableInfo } from "logform";

/**
 * Where a message is about, such as a file and lines. Host adapters convert their own types (a VS
 * Code `Uri` and `Range`, for example) to this one.
 */
export interface Location {
  /** The file path, relative to the host's root where that makes sense. */
  path: string;
  /** The 1-based first line. */
  line?: number;
  /** The 1-based last line, when the location spans lines. */
  endLine?: number;
  /** The 1-based column on `line`. */
  column?: number;
}

/** Formats a value for a log line; strings pass through unchanged. */
export function toLogText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return util.inspect(value, { depth: null, compact: false, colors: false, getters: true });
}

/**
 * Formats a location's lines, such as `[3]` or `[3:7]`. Returns an empty string when there is no
 * location or it has no line.
 */
export function rangeText(location?: Pick<Location, "line" | "endLine">): string {
  if (location?.line === undefined) {
    return "";
  }
  if (location.endLine === undefined || location.endLine === location.line) {
    return `[${location.line}]`;
  }
  return `[${location.line}:${location.endLine}]`;
}

/** The location that `forDocument()`-style child loggers attach to each line, if any. */
export function getLocation(info: TransformableInfo): Location | undefined {
  const location = info.location as Location | undefined;
  return location && typeof location.path === "string" ? location : undefined;
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
