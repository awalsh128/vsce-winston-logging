/* Resolves `import "vscode"` to the stub, since tests run outside the extension host. */
import Module from "node:module";
import * as path from "node:path";

const stub = path.join(__dirname, "vscode-stub.ts");
const mod = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const original = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  return request === "vscode" ? stub : original.call(this, request, ...rest);
};
