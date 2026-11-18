import type { Location } from "@awalsh128/winston-host";
import * as vscode from "vscode";

/**
 * Converts a VS Code document and optional range to a `Location`, with a workspace-relative path
 * and 1-based lines. A range that ends on line 0 or stays on one line is a single line.
 */
export function toLocation(uri: vscode.Uri, range?: vscode.Range): Location {
  const location: Location = { path: vscode.workspace.asRelativePath(uri) };
  if (range) {
    location.line = range.start.line + 1;
    if (range.end.line !== 0 && range.start.line !== range.end.line) {
      location.endLine = range.end.line;
    }
  }

  return location;
}
