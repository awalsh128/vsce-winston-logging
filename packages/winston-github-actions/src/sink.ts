import type { HostSink, Location } from "@awalsh128/winston-host";
import type { AnnotationProperties, Core } from "./core";

/** Converts a location to annotation properties, so errors and warnings point at the file and lines. */
export function toAnnotation(location?: Location): AnnotationProperties | undefined {
  if (!location) {
    return undefined;
  }
  const properties: AnnotationProperties = { file: location.path };
  if (location.line !== undefined) {
    properties.startLine = location.line;
  }
  if (location.endLine !== undefined) {
    properties.endLine = location.endLine;
  }
  if (location.column !== undefined) {
    properties.startColumn = location.column;
  }
  return properties;
}

/**
 * A `HostSink` that writes workflow commands through `@actions/core`: `error` and `warn` become
 * annotations, `info` a plain log line, and `debug` and `trace` debug lines, which the runner shows
 * only when debug logging is on.
 */
export function actionsSink(core: Core): HostSink {
  return {
    write(level, message, location) {
      switch (level) {
        case "error":
          return core.error(message, toAnnotation(location));
        case "warn":
          return core.warning(message, toAnnotation(location));
        case "info":
          return core.info(message);
        default:
          return core.debug(message);
      }
    },
  };
}
