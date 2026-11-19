import { expect } from "chai";
import * as winston from "winston";
import { ActionsTransport, type Core } from "../src/index.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
type Call = [method: string, ...args: unknown[]];

function fakeCore(): Core & { calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) =>
      void calls.push([method, ...args]);
  return {
    calls,
    info: record("info"),
    debug: record("debug"),
    warning: record("warning"),
    error: record("error"),
    startGroup: record("startGroup"),
    endGroup: record("endGroup"),
    setSecret: record("setSecret"),
    isDebug: () => false,
  };
}

describe("ActionsTransport", () => {
  it("works in a plain winston logger with the npm levels", async () => {
    const core = fakeCore();
    const logger = winston.createLogger({
      level: "silly",
      transports: [new ActionsTransport({ core })],
    });
    logger.error("e");
    logger.warn("w");
    logger.info("i");
    logger.verbose("v");
    logger.debug("d");
    logger.silly("s");
    await flush();
    expect(core.calls).to.deep.equal([
      ["error", "e", undefined],
      ["warning", "w", undefined],
      ["info", "i"],
      ["info", "v"],
      ["debug", "d"],
      ["debug", "s"],
    ]);
  });

  it("annotates lines that carry a location", async () => {
    const core = fakeCore();
    const logger = winston.createLogger({ transports: [new ActionsTransport({ core })] });
    logger.child({ location: { path: "a.ts", line: 3, endLine: 5 } }).warn("careful");
    await flush();
    expect(core.calls).to.deep.equal([["warning", "careful", { file: "a.ts", startLine: 3, endLine: 5 }]]);
  });

  it("writes the formatted line when the transport has a format", async () => {
    const core = fakeCore();
    const logger = winston.createLogger({
      transports: [
        new ActionsTransport({
          core,
          format: winston.format.printf((i) => `<${i.message}>`),
        }),
      ],
    });
    logger.info("hi");
    await flush();
    expect(core.calls).to.deep.equal([["info", "<hi>"]]);
  });

  it("follows the transport's level", async () => {
    const core = fakeCore();
    const logger = winston.createLogger({
      level: "silly",
      transports: [new ActionsTransport({ core, level: "warn" })],
    });
    logger.info("hidden");
    logger.error("shown");
    await flush();
    expect(core.calls.map((c) => c[0])).to.deep.equal(["error"]);
  });

  it("writes through the installed @actions/core when none is given", async () => {
    const written: string[] = [];
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      winston.createLogger({ transports: [new ActionsTransport()] }).info("default core line");
      await flush();
    } finally {
      process.stdout.write = write;
    }

    expect(written.join("")).to.contain("default core line");
  });
});
