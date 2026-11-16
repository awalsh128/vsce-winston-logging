import { expect } from "chai";
import {
  ActionsLogger,
  levelFromEnv,
  logAndGetError,
  toAnnotation,
  type AnnotationProperties,
  type Core,
} from "../src";

/** Lets the transports flush, since winston writes asynchronously. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

type Call = [method: string, ...args: unknown[]];

/** Fake `@actions/core` recording every call. */
function fakeCore(debug = false): Core & { calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => void calls.push([method, ...args]);
  return {
    calls,
    info: record("info"),
    debug: record("debug"),
    warning: record("warning"),
    error: record("error"),
    startGroup: record("startGroup"),
    endGroup: record("endGroup"),
    setSecret: record("setSecret"),
    isDebug: () => debug,
  };
}

describe("winston-github-actions", () => {
  describe("levelFromEnv", () => {
    it("is info by default", () => {
      expect(levelFromEnv(fakeCore(), {})).to.equal("info");
    });

    it("is trace when the runner's debug logging is on", () => {
      expect(levelFromEnv(fakeCore(true), {})).to.equal("trace");
      expect(levelFromEnv(fakeCore(), { RUNNER_DEBUG: "1" })).to.equal("trace");
      expect(levelFromEnv(fakeCore(), { ACTIONS_STEP_DEBUG: "true" })).to.equal("trace");
      expect(levelFromEnv(fakeCore(), { ACTIONS_STEP_DEBUG: "1" })).to.equal("trace");
    });

    it("ignores other values", () => {
      expect(levelFromEnv(fakeCore(), { RUNNER_DEBUG: "0", ACTIONS_STEP_DEBUG: "false" })).to.equal("info");
    });
  });

  describe("toAnnotation", () => {
    it("converts locations to annotation properties", () => {
      expect(toAnnotation()).to.be.undefined;
      expect(toAnnotation({ path: "a.ts" })).to.deep.equal({ file: "a.ts" });
      expect(toAnnotation({ path: "a.ts", line: 3, endLine: 6, column: 2 })).to.deep.equal({
        file: "a.ts",
        startLine: 3,
        endLine: 6,
        startColumn: 2,
      });
    });
  });

  describe("ActionsLogger", () => {
    let core: ReturnType<typeof fakeCore>;
    let logger: ActionsLogger;

    const make = (debug = false) => {
      core = fakeCore(debug);
      logger = new ActionsLogger({ core, env: {} });
    };
    afterEach(() => logger.dispose());

    it("maps levels to workflow commands", async () => {
      make(true);
      logger.error("e");
      logger.warn("w");
      logger.info("i");
      logger.debug("d");
      logger.trace("t");
      await flush();

      expect(core.calls).to.deep.equal([
        ["error", "e", undefined],
        ["warning", "w", undefined],
        ["info", "i"],
        ["debug", "d"],
        ["debug", "t"],
      ]);
    });

    it("drops debug and trace unless the runner's debug logging is on", async () => {
      make(false);
      logger.debug("d");
      logger.trace("t");
      logger.info("i");
      await flush();

      expect(core.calls).to.deep.equal([["info", "i"]]);
    });

    it("annotates errors and warnings with the location, and leaves it out of the message", async () => {
      make();
      const file = logger.forLocation({ path: "src/a.ts", line: 3, endLine: 6 });
      file.error("bad");
      file.warn("iffy");
      file.info("fine");
      await flush();

      const props: AnnotationProperties = { file: "src/a.ts", startLine: 3, endLine: 6 };
      expect(core.calls).to.deep.equal([
        ["error", "bad", props],
        ["warning", "iffy", props],
        ["info", "fine"],
      ]);
    });

    it("builds lazy messages only when the level is enabled", async () => {
      make(false);
      let built = 0;
      logger.debugLazy(() => `x${++built}`);
      logger.infoLazy(() => `y${++built}`);
      await flush();

      expect(built).to.equal(1);
      expect(core.calls).to.deep.equal([["info", "y1"]]);
    });

    it("logs errors from logAndGetError as error annotations", async () => {
      make();
      logAndGetError(logger, new Error("boom"));
      await flush();

      expect(core.calls).to.have.length(1);
      expect(core.calls[0][0]).to.equal("error");
      expect(core.calls[0][1]).to.include("boom");
    });

    it("wraps a group's work and logs the time after it ends", async () => {
      make();
      logger.group("Scan").dispose();
      await flush();

      expect(core.calls.map(([m]) => m)).to.deep.equal(["startGroup", "endGroup", "info"]);
      expect(core.calls[0]).to.deep.equal(["startGroup", "Scan"]);
      expect(core.calls[2][1]).to.match(/^Scan \(\d+ms\)$/);
    });

    it("only times a group started inside another, and allows a new group after", async () => {
      make();
      const outer = logger.group("Outer");
      logger.group("Inner").dispose();
      outer.dispose();
      logger.group("Next").dispose();
      await flush();

      expect(core.calls.filter(([m]) => m === "startGroup").map(([, t]) => t)).to.deep.equal(["Outer", "Next"]);
      expect(core.calls.filter(([m]) => m === "endGroup")).to.have.length(2);
    });

    it("does not log a group's time below its level", async () => {
      make();
      logger.group("Quiet", "debug").dispose();
      await flush();

      expect(core.calls.map(([m]) => m)).to.deep.equal(["startGroup", "endGroup"]);
    });

    it("masks secrets through core", () => {
      make();
      logger.maskSecret("hunter2");

      expect(core.calls).to.deep.equal([["setSecret", "hunter2"]]);
    });
  });

  describe("with the real @actions/core", () => {
    it("writes workflow commands to stdout", async () => {
      const written: string[] = [];
      const original = process.stdout.write;
      process.stdout.write = ((chunk: string | Uint8Array) => (written.push(String(chunk)), true)) as never;
      const real = new ActionsLogger({ env: {} });
      try {
        real.forLocation({ path: "a.ts", line: 2 }).error("boom");
        real.info("hello");
        await flush();
      } finally {
        process.stdout.write = original;
        real.dispose();
      }

      expect(written.join("")).to.include("::error file=a.ts,line=2::boom").and.to.include("hello");
    });
  });
});
