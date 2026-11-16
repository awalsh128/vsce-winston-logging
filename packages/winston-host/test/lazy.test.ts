import { expect } from "chai";
import * as winston from "winston";
import { findNativeLazy, HostLogger, LazyLogger, resetNativeLazy, usesNativeLazy, type LogLevel } from "../src";
import { FakeHost } from "./fake-host";

/** Lets the transports flush, since winston writes asynchronously. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug", "trace"];

/**
 * A `createLogger` standing in for a Winston that has PR #2626: the level methods of the logger it
 * returns take a function first argument, with that PR's first version of the semantics (the
 * function's result replaces every argument).
 */
function createLoggerWithLazyPr(calls: { count: number }): typeof winston.createLogger {
  // Captured now: tests replace winston.createLogger with the function returned below.
  const base = winston.createLogger;
  return (options) => {
    const logger = base(options);
    const prototype = Object.getPrototypeOf(logger);
    for (const level of LEVELS) {
      const original = prototype[level];
      prototype[level] = function (this: winston.Logger, ...args: unknown[]) {
        if (typeof args[0] === "function") {
          calls.count++;
          if (!this.isLevelEnabled(level)) return this;
          args = [(args[0] as () => unknown)()];
        }
        return original.apply(this, args);
      };
    }
    return logger;
  };
}

describe("lazy logging", () => {
  let host: FakeHost;
  let logger: HostLogger;

  beforeEach(() => {
    host = new FakeHost("info");
    logger = new HostLogger(host);
  });
  afterEach(() => logger.dispose());

  describe("level methods with a function message (the shim)", () => {
    it("uses the installed Winston, which doesn't have the feature", () => {
      expect(usesNativeLazy()).to.be.false;
    });

    it("does not call the function when the level is disabled", async () => {
      let calls = 0;
      logger.debug(() => (calls++, "hidden"));
      logger.trace(() => (calls++, "hidden"));
      await flush();

      expect(calls).to.equal(0);
      expect(host.lines).to.be.empty;
    });

    it("calls the function once when the level is enabled and logs its result", async () => {
      let calls = 0;
      logger.info(() => (calls++, "built"));
      await flush();

      expect(calls).to.equal(1);
      expect(host.lines).to.deep.equal([["info", "built"]]);
    });

    it("keeps metadata after the function", async () => {
      const seen: unknown[] = [];
      logger.add(
        new winston.transports.Stream({
          stream: new (require("node:stream").Writable)({ write: (_c: unknown, _e: unknown, cb: () => void) => cb() }),
          format: winston.format((info) => (seen.push(info.requestId), info))(),
        }),
      );
      logger.info(() => "with meta", { requestId: "r1" });
      await flush();

      expect(host.lines).to.deep.equal([["info", "with meta"]]);
      expect(seen).to.deep.equal(["r1"]);
    });

    it("passes an undefined result on as the message instead of an empty string", async () => {
      const messages: unknown[] = [];
      logger.add(
        new winston.transports.Stream({
          stream: new (require("node:stream").Writable)({ write: (_c: unknown, _e: unknown, cb: () => void) => cb() }),
          format: winston.format((info) => (messages.push(info.message), info))(),
        }),
      );
      logger.info(() => undefined);
      await flush();

      expect(messages).to.deep.equal([undefined]);
    });

    it("does not call the function when the logger is silent", () => {
      logger.setLevel("off");
      let calls = 0;
      logger.error(() => (calls++, "x"));

      expect(calls).to.equal(0);
    });

    it("works on child loggers with their metadata", async () => {
      const child = logger.child({ location: { path: "a.ts", line: 2 } });
      child.warn(() => "from child");
      await flush();

      expect(host.lines).to.deep.equal([["warn", "a.ts[2]: from child"]]);
    });

    it("leaves plain messages, objects and metadata calls alone", async () => {
      logger.info("plain");
      logger.info({ message: "object" } as never);
      logger.info("with meta", { requestId: "r1" });
      await flush();

      expect(host.lines.map(([, m]) => m)).to.deep.equal(["plain", "object", "with meta"]);
    });

    it("keeps working through the *Lazy aliases", async () => {
      let calls = 0;
      logger.debugLazy(() => (calls++, "hidden"));
      logger.infoLazy(() => "shown");
      logger.logLazy("warn", () => "also shown");
      await flush();

      expect(calls).to.equal(0);
      expect(host.lines).to.deep.equal([["info", "shown"], ["warn", "also shown"]]);
    });

    it("type-checks the function overload on a plain winston logger (compile-time interception)", () => {
      const plain = winston.createLogger({ transports: [new winston.transports.Console({ silent: true })] });
      // These lines only compile because the package augments winston's LeveledLogMethod.
      plain.info(() => "message", { requestId: "r1" });
      plain.debug(() => ({ message: "object" }));
      expect(plain.level).to.equal("info");
    });
  });

  describe("findNativeLazy", () => {
    it("returns undefined for a Winston without the feature", () => {
      expect(findNativeLazy()).to.be.undefined;
    });

    it("returns the level methods of a Winston with the feature", () => {
      const methods = findNativeLazy(createLoggerWithLazyPr({ count: 0 }));

      expect(Object.keys(methods ?? {})).to.have.members(LEVELS);
    });

    it("returns undefined when probing throws", () => {
      expect(
        findNativeLazy(() => {
          throw new Error("boom");
        }),
      ).to.be.undefined;
    });
  });

  describe("with a Winston that has the feature", () => {
    const real = require("winston") as { createLogger: typeof winston.createLogger };
    const original = real.createLogger;
    const calls = { count: 0 };

    beforeEach(() => {
      calls.count = 0;
      real.createLogger = createLoggerWithLazyPr(calls);
      resetNativeLazy();
    });
    afterEach(() => {
      real.createLogger = original;
      resetNativeLazy();
    });

    it("detects it", () => {
      expect(usesNativeLazy()).to.be.true;
    });

    it("hands function messages to Winston's own level methods", async () => {
      const lazy = new HostLogger(new FakeHost("info"));
      const before = calls.count;
      lazy.info(() => "native");
      await flush();
      lazy.dispose();

      expect(calls.count).to.be.greaterThan(before);
    });

    it("keeps the metadata after a function, which the PR's first version drops, by using the shim", async () => {
      const seen: unknown[] = [];
      const lazy = new HostLogger(new FakeHost("info"), {
        transports: [
          new winston.transports.Stream({
            stream: new (require("node:stream").Writable)({ write: (_c: unknown, _e: unknown, cb: () => void) => cb() }),
            format: winston.format((info) => (seen.push(info.requestId), info))(),
          }),
        ],
      });
      usesNativeLazy(); // detection probes once; do it before taking the baseline
      const before = calls.count;
      lazy.info(() => "with meta", { requestId: "r1" });
      await flush();
      lazy.dispose();

      expect(seen).to.deep.equal(["r1"]);
      expect(calls.count).to.equal(before);
    });

    it("still skips the function for a disabled level and for a silent logger", () => {
      const lazy = new HostLogger(new FakeHost("info"));
      let built = 0;
      lazy.debug(() => (built++, "hidden"));
      lazy.setLevel("off");
      lazy.error(() => (built++, "hidden"));
      lazy.dispose();

      expect(built).to.equal(0);
    });

    it("leaves plain messages to the usual path", async () => {
      const h = new FakeHost("info");
      const lazy = new HostLogger(h);
      lazy.info("plain");
      await flush();
      lazy.dispose();

      expect(h.lines).to.deep.equal([["info", "plain"]]);
    });
  });

  it("LazyLogger is still the shared base class", () => {
    expect(logger).to.be.instanceOf(LazyLogger);
  });
});
