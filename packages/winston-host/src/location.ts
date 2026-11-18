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
