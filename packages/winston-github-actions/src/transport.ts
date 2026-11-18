import { getLocation, plainFormat, type Location } from "@awalsh128/winston-host";
import type { TransformableInfo } from "logform";
import { LEVEL, MESSAGE } from "triple-beam";
import * as winston from "winston";
import TransportStream from "winston-transport";
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

/** Options for `ActionsTransport`. */
export interface ActionsTransportOptions extends TransportStream.TransportStreamOptions {
  /** The `@actions/core` to write through. Defaults to the installed one. */
  core?: Core;
  /** Formats each line. Defaults to the message alone, with errors dumped in full. */
  format?: TransportStream.TransportStreamOptions["format"];
}

/** What a workflow log can show a line as. */
type Command = "error" | "warning" | "info" | "debug";

/**
 * Maps a Winston level, from either the npm levels or this package's own, to a workflow command.
 * Unknown levels become `info`, so no line is lost.
 */
function commandFor(level: string): Command {
  switch (level) {
    case "error":
      return "error";
    case "warn":
    case "warning":
      return "warning";
    case "debug":
    case "trace":
    case "silly":
      return "debug";
    default:
      return "info";
  }
}

/**
 * Winston transport that writes workflow commands through `@actions/core`: `error` and `warn`
 * become annotations (pointing at `info.location` when the line has one), `info` a plain log line,
 * and `debug` and `trace` debug lines, which the runner shows only when debug logging is on.
 *
 * Lines default to the plain message; pass `format` for something else. It works with any Winston logger, so there is no need for `HostLogger`:
 *
 * ```ts
 * const logger = winston.createLogger({ transports: [new ActionsTransport()] });
 * ```
 */
export class ActionsTransport extends TransportStream {
  private core?: Core;

  constructor(opts: ActionsTransportOptions = {}) {
    // Without its own format, a transport would get the logger's, which is JSON by default.
    super({ ...opts, format: opts.format ?? winston.format.printf(plainFormat) });
    this.core = opts.core;
  }

  override log(info: TransformableInfo, next: () => void): void {
    setImmediate(() => this.emit("logged", info));
    // `info[MESSAGE]` is the formatted line when the transport has a format; otherwise the message.
    const message = String(info[MESSAGE] ?? info.message ?? "");
    const command = commandFor(String(info[LEVEL] ?? info.level ?? "info"));
    const core = this.core ?? (this.core = loadCore());
    if (command === "error" || command === "warning") {
      core[command](message, toAnnotation(getLocation(info)));
    } else {
      core[command](message);
    }

    next();
  }
}

/** Loads the installed `@actions/core` on first use, so a transport given a `core` never needs it. */
function loadCore(): Core {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@actions/core") as Core;
}
