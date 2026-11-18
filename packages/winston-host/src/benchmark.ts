import { performance } from "node:perf_hooks";
import type { Disposable } from "./disposable";
import type { LazyLogger } from "./lazy";
import type { LogLevel } from "./levels";

/** Simple stopwatch to measure elapsed time. */
export class Benchmark {
  private readonly startTime = performance.now();

  /** Gets the elapsed time since creation in milliseconds. */
  getDelta(): number {
    return performance.now() - this.startTime;
  }

  /** Gets the elapsed time since creation as text, such as `42ms`. */
  getDeltaAsText(): string {
    return `${this.getDelta().toFixed(0)}ms`;
  }
}

/** What a `DisposableBenchmark` logs when it is disposed: the level and the line without the delta. */
export interface BenchmarkLog {
  /** The level to log at. */
  level: LogLevel;
  /** The message; the elapsed time is appended to it. */
  message: string;
}

/**
 * Stopwatch that logs the elapsed time when it is disposed, such as with `using` or by adding it to
 * the extension's subscriptions.
 *
 * The lambda runs only on disposal, and only when the level it returns is enabled, so the message
 * costs nothing when it is not logged. The lambda picks the level, and the elapsed time is appended
 * to its message, such as `Scan finished (42ms)`.
 *
 * ```ts
 * using _ = new DisposableBenchmark(logger, () => ({ level: "debug", message: "Scan finished" }));
 * ```
 */
export class DisposableBenchmark extends Benchmark implements Disposable {
  /**
   * @param logger The logger to write to.
   * @param getLog Returns the level and message to log; called when the benchmark is disposed.
   */
  constructor(
    private readonly logger: LazyLogger,
    private readonly getLog: () => BenchmarkLog,
  ) {
    super();
  }

  /** Logs the lambda's message at its level, followed by the elapsed time. */
  dispose(): void {
    if (this.logger.silent || !this.logger.isLevelEnabled(this.getLog().level)) {
      return;
    }
    const { level, message } = this.getLog();
    this.logger.logLazy(level, () => `${message} (${this.getDeltaAsText()})`);
  }
}
