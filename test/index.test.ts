import { expect } from "chai";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as winston from "winston";
import {
  Benchmark,
  defaultFormat,
  ExtensionLogger,
  fromVscodeLogLevel,
  logAndGetError,
  rangeText,
  setLogLevel,
} from "../src";
import { LogLevel, Range, state, Uri, workspace } from "./vscode-stub";

/** Lets the transports flush, since winston writes asynchronously. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("vsce-winston-logging", () => {
  let logger: ExtensionLogger;
  const channel = () => state.lastChannel!;

  beforeEach(() => {
    state.initialLevel = LogLevel.Info;
    workspace.workspaceFolders = undefined;
    logger = new ExtensionLogger({ name: "Test" });
  });

  afterEach(() => logger.dispose());

  describe("fromVscodeLogLevel", () => {
    const cases: [LogLevel, string][] = [
      [LogLevel.Off, "off"],
      [LogLevel.Trace, "trace"],
      [LogLevel.Debug, "debug"],
      [LogLevel.Info, "info"],
      [LogLevel.Warning, "warn"],
      [LogLevel.Error, "error"],
    ];
    cases.forEach(([vscodeLevel, expected]) => {
      it(`maps ${LogLevel[vscodeLevel]} to ${expected}`, () => {
        expect(fromVscodeLogLevel(vscodeLevel as never)).to.equal(expected);
      });
    });
  });

  describe("ExtensionLogger", () => {
    it("writes each level to the matching channel method", async () => {
      logger.setLevel("trace");
      channel().lines.length = 0;

      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");
      logger.trace("t");
      await flush();

      expect(channel().lines).to.deep.equal([
        ["error", "e"],
        ["warn", "w"],
        ["info", "i"],
        ["debug", "d"],
        ["trace", "t"],
      ]);
    });

    it("starts at the channel's level", async () => {
      state.initialLevel = LogLevel.Warning;
      const warnLogger = new ExtensionLogger({ name: "Warn" });

      warnLogger.info("dropped");
      warnLogger.warn("kept");
      await flush();

      expect(channel().lines).to.deep.equal([["warn", "kept"]]);
      warnLogger.dispose();
    });

    it("follows the channel's level changes", async () => {
      channel().fireLogLevel(LogLevel.Debug);
      logger.debug("now visible");
      await flush();

      expect(logger.level).to.equal("debug");
      expect(channel().lines).to.deep.include(["debug", "now visible"]);
    });

    it("is silent when the channel is off", async () => {
      channel().fireLogLevel(LogLevel.Off);
      channel().lines.length = 0;
      logger.error("dropped");
      await flush();

      expect(channel().lines).to.be.empty;
    });

    it("builds lazy messages only when the level is enabled", async () => {
      let built = 0;
      const build = () => `built ${++built}`;

      logger.debugLazy(build);
      logger.infoLazy(build);
      await flush();

      expect(built).to.equal(1);
      expect(channel().lines).to.deep.equal([["info", "built 1"]]);
    });

    it("prefixes document loggers with the path and range", async () => {
      workspace.workspaceFolders = [{ uri: Uri.file("/ws") }];

      const docLogger = logger.forDocument(Uri.file("/ws/src/a.ts") as never, new Range(2, 0, 6, 0) as never);
      docLogger.info("message");
      docLogger.infoLazy(() => "lazy");
      await flush();

      expect(channel().lines).to.deep.equal([
        ["info", "src/a.ts[3:6]: message"],
        ["info", "src/a.ts[3:6]: lazy"],
      ]);
    });

    it("uses a custom format", async () => {
      const custom = new ExtensionLogger({ name: "Custom", format: (info) => `<${info.message}>` });
      custom.info("x");
      await flush();

      expect(channel().lines).to.deep.equal([["info", "<x>"]]);
      custom.dispose();
    });

    it("reveals the channel only when asked", () => {
      expect(channel().shown).to.be.false;
      const shown = new ExtensionLogger({ name: "Shown", show: true });
      expect(channel().shown).to.be.true;
      shown.dispose();
    });

    it("stops following the channel and disposes it on dispose", () => {
      const ch = channel();
      logger.dispose();

      ch.fireLogLevel(LogLevel.Trace);

      expect(ch.disposed).to.be.true;
      expect(logger.level).to.equal("info");
    });
  });

  describe("setFileLogging", () => {
    let dir: string;

    beforeEach(() => (dir = fs.mkdtempSync(path.join(os.tmpdir(), "vsce-winston-logging-"))));
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    const fileTransports = () => logger.transports.filter((t) => t instanceof winston.transports.File);

    it("resolves relative paths against the base directory", () => {
      expect(logger.setFileLogging("logs/out.log", dir)).to.equal(path.join(dir, "logs/out.log"));
      expect(fileTransports()).to.have.lengthOf(1);
    });

    it("resolves relative paths against the first workspace folder by default", () => {
      workspace.workspaceFolders = [{ uri: Uri.file(dir) }];
      expect(logger.setFileLogging("out.log")).to.equal(path.join(dir, "out.log"));
    });

    it("keeps absolute paths", () => {
      const abs = path.join(dir, "abs.log");
      expect(logger.setFileLogging(abs, "/elsewhere")).to.equal(abs);
    });

    it("replaces the previous file and removes it when disabled", () => {
      logger.setFileLogging("a.log", dir);
      logger.setFileLogging("b.log", dir);
      expect(fileTransports()).to.have.lengthOf(1);

      expect(logger.setFileLogging("")).to.be.undefined;
      expect(fileTransports()).to.be.empty;
    });

    it("writes timestamped lines to the file", async () => {
      const file = logger.setFileLogging("out.log", dir)!;
      logger.warn("to file");
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(fs.readFileSync(file, "utf8")).to.match(/^\S+ \[warn\] to file$/m);
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
        const err = logAndGetError(logger, input);
        await flush();

        expect(err).to.be.instanceOf(Error);
        expect(err.message).to.equal(message);
        expect(channel().lines[0][0]).to.equal("error");
        expect(channel().lines[0][1]).to.include(logged as string);
      });
    });
  });

  describe("rangeText", () => {
    it("formats ranges as 1-based lines", () => {
      expect(rangeText()).to.equal("");
      expect(rangeText(new Range(4, 0, 4, 9) as never)).to.equal("[5]");
      expect(rangeText(new Range(4, 0, 0, 0) as never)).to.equal("[5]");
      expect(rangeText(new Range(4, 0, 8, 0) as never)).to.equal("[5:8]");
    });
  });

  describe("defaultFormat", () => {
    it("formats plain messages as is", () => {
      expect(defaultFormat({ level: "info", message: "hi" })).to.equal("hi");
    });
  });

  describe("Benchmark", () => {
    it("reports elapsed milliseconds", () => {
      expect(new Benchmark().getDeltaAsText()).to.match(/^\d+ms$/);
    });
  });
});
