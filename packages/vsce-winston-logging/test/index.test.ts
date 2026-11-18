import "../../winston-vscode/test/setup";
import { expect } from "chai";
import * as shim from "../src";
import * as vscode from "@awalsh128/winston-vscode";

describe("vsce-winston-logging shim", () => {
  it("re-exports the whole @awalsh128/winston-vscode API", () => {
    expect(Object.keys(shim).sort()).to.deep.equal(Object.keys(vscode).sort());
    for (const name of [
      "ExtensionLogger",
      "LazyLogger",
      "OutputChannelTransport",
      "logAndGetError",
      "Benchmark",
      "DisposableBenchmark",
      "defaultFormat",
      "rangeText",
      "toLogText",
      "setLogLevel",
      "fromVscodeLogLevel",
      "LOG_LEVELS",
    ]) {
      expect(shim, name).to.have.property(name);
    }
  });
});
