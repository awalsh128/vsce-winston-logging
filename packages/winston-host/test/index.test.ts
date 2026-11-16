import { expect } from "chai";
import { Writable } from "node:stream";
import * as winston from "winston";
import {
  Benchmark,
  defaultFormat,
  DisposableBenchmark,
  HostLogger,
  HostTransport,
  isLogLevel,
  LOG_LEVELS,
  logAndGetError,
  plainFormat,
  rangeText,
  setLogLevel,
} from "../src";
import { FakeHost } from "./fake-host";

/** Lets the transports flush, since winston writes asynchronously. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("winston-host", () => {
  describe("levels", () => {
    it("orders levels from most to least severe", () => {
      expect(Object.keys(LOG_LEVELS)).to.deep.equal(["error", "warn", "info", "debug", "trace"]);
    });

    it("recognises only its own levels", () => {
      expect(isLogLevel("warn")).to.be.true;
      expect(isLogLevel("warning")).to.be.false;
      expect(isLogLevel("toString")).to.be.false;
    });
  });

  describe("HostLogger", () => {
    let host: FakeHost;
    let logger: HostLogger;

    beforeEach(() => {
      host = new FakeHost("info");
      logger = new HostLogger(host);
    });
    afterEach(() => logger.dispose());

    it("writes each level to the sink", async () => {
      host.fireLevel("trace");
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");
      logger.trace("t");
      await flush();

      expect(host.lines.filter(([, m]) => !m.startsWith("Log level"))).to.deep.equal([
        ["error", "e"],
        ["warn", "w"],
        ["info", "i"],
        ["debug", "d"],
        ["trace", "t"],
      ]);
    });

    it("starts at the host's level", async () => {
      const warnHost = new FakeHost("warn");
      const warnLogger = new HostLogger(warnHost);
      warnLogger.info("dropped");
      warnLogger.warn("kept");
      await flush();

      expect(warnHost.lines).to.deep.equal([["warn", "kept"]]);
      warnLogger.dispose();
    });

    it("follows the host's level changes", async () => {
      host.fireLevel("debug");
      logger.debug("now visible");
      await flush();

      expect(logger.level).to.equal("debug");
      expect(host.lines).to.deep.include(["debug", "now visible"]);
    });

    it("is silent when the host is off, and recovers when it is not", async () => {
      const offHost = new FakeHost("off");
      const offLogger = new HostLogger(offHost);
      offLogger.error("dropped");
      offHost.fireLevel("error");
      offLogger.error("kept");
      await flush();

      expect(offHost.lines).to.deep.equal([["error", "kept"]]);
      offLogger.dispose();
    });

    it("works with a host whose level never changes", async () => {
      const fixed = new FakeHost("info", false);
      const fixedLogger = new HostLogger(fixed);
      fixedLogger.info("hello");
      await flush();

      expect(fixed.lines).to.deep.equal([["info", "hello"]]);
      expect(() => fixedLogger.dispose()).not.to.throw();
      expect(fixed.disposed).to.be.true;
    });

    it("builds lazy messages only when the level is enabled", async () => {
      let built = 0;
      const build = () => `built ${++built}`;

      logger.debugLazy(build);
      logger.infoLazy(build);
      await flush();

      expect(built).to.equal(1);
      expect(host.lines).to.deep.equal([["info", "built 1"]]);
    });

    it("keeps lazy methods on child loggers and passes their location to the sink", async () => {
      const child = logger.child({ location: { path: "src/a.ts", line: 3, endLine: 6 } });
      child.info("message");
      child.infoLazy(() => "lazy");
      await flush();

      expect(host.lines).to.deep.equal([
        ["info", "src/a.ts[3:6]: message"],
        ["info", "src/a.ts[3:6]: lazy"],
      ]);
      expect(host.locations[0]).to.deep.equal({ path: "src/a.ts", line: 3, endLine: 6 });
    });

    it("creates location loggers with forLocation", async () => {
      logger.forLocation({ path: "b.ts", line: 9 }).info("here");
      await flush();

      expect(host.lines).to.deep.equal([["info", "b.ts[9]: here"]]);
    });

    it("uses a custom format", async () => {
      const custom = new HostLogger(host, { format: (info) => `<${info.message}>` });
      custom.info("x");
      await flush();

      expect(host.lines).to.deep.equal([["info", "<x>"]]);
      custom.dispose();
    });

    it("writes to extra transports and sets their level from the host", async () => {
      const lines: string[] = [];
      const extra = new winston.transports.Stream({
        stream: new Writable({
          write(chunk: Buffer, _enc: string, cb: () => void) {
            lines.push(chunk.toString());
            cb();
          },
        }),
        level: "error",
        format: winston.format.printf((info) => `extra: ${info.message}`),
      });
      const withExtra = new HostLogger(host, { transports: [extra] });

      withExtra.info("hello");
      await flush();
      expect(lines).to.deep.equal(["extra: hello\n"]);

      host.fireLevel("warn");
      expect(extra.level).to.equal("warn");
      withExtra.dispose();
    });

    it("stops following the host and disposes it on dispose", () => {
      expect(host.subscribed).to.be.true;
      logger.dispose();

      host.fireLevel("trace");

      expect(host.subscribed).to.be.false;
      expect(host.disposed).to.be.true;
      expect(logger.level).to.equal("info");
    });

    it("sets the level from code", () => {
      logger.setLevel("trace");
      expect(logger.level).to.equal("trace");
      logger.setLevel("off");
      expect(logger.silent).to.be.true;
    });
  });

  describe("HostTransport", () => {
    it("writes lines with unknown levels through writeUnknown, or as info without it", async () => {
      const seen: string[] = [];
      const withUnknown = new HostTransport({
        sink: { write: () => undefined, writeUnknown: (l, m) => void seen.push(`${l}:${m}`) },
      });
      const lines: [string, string][] = [];
      const without = new HostTransport({ sink: { write: (l, m) => void lines.push([l, m]) } });
      const info = { level: "silly", message: "x" };

      withUnknown.log(info, () => undefined);
      without.log(info, () => undefined);
      await flush();

      expect(seen).to.deep.equal(["silly:x"]);
      expect(lines).to.deep.equal([["info", "[UNKNOWN/silly] x"]]);
    });
  });

  describe("setLogLevel", () => {
    it("sets the logger and transport levels", () => {
      const transport = new winston.transports.Console({ level: "info", silent: true });
      const plain = winston.createLogger({ level: "info", transports: [transport] });

      setLogLevel(plain, "debug");

      expect(plain.level).to.equal("debug");
      expect(transport.level).to.equal("debug");
    });
  });

  describe("logAndGetError", () => {
    [
      ["an Error", new Error("boom"), "boom", "boom"],
      ["a string", "boom", "boom", "boom"],
      ["an object", { code: 1 }, "{\n  code: 1\n}", "code: 1"],
    ].forEach(([name, input, message, logged]) => {
      it(`logs and returns ${name} as an Error`, async () => {
        const host = new FakeHost("info");
        const logger = new HostLogger(host);
        const err = logAndGetError(logger, input);
        await flush();

        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal(message);
        expect(host.lines[0][0]).to.equal("error");
        expect(host.lines[0][1]).to.include(logged as string);
        logger.dispose();
      });
    });
  });

  describe("rangeText", () => {
    it("formats locations as 1-based lines", () => {
      expect(rangeText()).to.equal("");
      expect(rangeText({})).to.equal("");
      expect(rangeText({ line: 5 })).to.equal("[5]");
      expect(rangeText({ line: 5, endLine: 5 })).to.equal("[5]");
      expect(rangeText({ line: 5, endLine: 8 })).to.equal("[5:8]");
    });
  });

  describe("formats", () => {
    it("formats plain messages as is", () => {
      expect(defaultFormat({ level: "info", message: "hi" })).to.equal("hi");
    });

    it("prefixes the location's path and lines, and plainFormat does not", () => {
      const info = { level: "info", message: "hi", location: { path: "a.ts", line: 2 } };
      expect(defaultFormat(info)).to.equal("a.ts[2]: hi");
      expect(plainFormat(info)).to.equal("hi");
    });

    it("ignores malformed locations", () => {
      expect(defaultFormat({ level: "info", message: "hi", location: "nope" })).to.equal("hi");
    });
  });

  describe("DisposableBenchmark", () => {
    let host: FakeHost;
    let logger: HostLogger;
    beforeEach(() => {
      host = new FakeHost("debug");
      logger = new HostLogger(host);
    });
    afterEach(() => logger.dispose());

    it("logs the message at the lambda's level with the delta appended", async () => {
      new DisposableBenchmark(logger, () => ({ level: "debug", message: "Scan finished" })).dispose();
      await flush();

      expect(host.lines).to.have.length(1);
      expect(host.lines[0][0]).to.equal("debug");
      expect(host.lines[0][1]).to.match(/^Scan finished \(\d+ms\)$/);
    });

    it("does nothing when the level is not enabled", async () => {
      new DisposableBenchmark(logger, () => ({ level: "trace", message: "hidden" })).dispose();
      await flush();

      expect(host.lines).to.be.empty;
    });

    it("does not call the lambda when the logger is silent", () => {
      logger.setLevel("off");
      let called = false;

      new DisposableBenchmark(logger, () => ((called = true), { level: "error", message: "x" })).dispose();

      expect(called).to.be.false;
    });
  });

  describe("Benchmark", () => {
    it("reports elapsed milliseconds", () => {
      expect(new Benchmark().getDeltaAsText()).to.match(/^\d+ms$/);
    });
  });
});
