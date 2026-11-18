import {
  Benchmark,
  HostLogger,
  plainFormat,
  type Disposable,
  type Host,
  type LogLevel,
  type LogLevelOrOff,
  type HostLoggerOptions,
} from "@awalsh128/winston-host";
import * as actionsCore from "@actions/core";
import type { Core } from "./core";
import { ActionsTransport } from "./transport";

/** The level for a run: everything when the runner's debug logging is on, otherwise `info`. */
export function levelFromEnv(core: Core, env: NodeJS.ProcessEnv = process.env): LogLevelOrOff {
  const stepDebug = env.ACTIONS_STEP_DEBUG;
  return core.isDebug() || env.RUNNER_DEBUG === "1" || stepDebug === "true" || stepDebug === "1"
    ? "trace"
    : "info";
}

/** Options for `ActionsLogger`. */
export interface ActionsLoggerOptions extends HostLoggerOptions {
  /** The `@actions/core` to use. Defaults to the installed one. */
  core?: Core;
  /** The environment to read the debug settings from. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * A stopwatch that wraps its work in a collapsible log group and logs the elapsed time after the
 * group, so the time shows when the group is collapsed. Groups can't nest in a workflow log, so one
 * started inside another only times.
 */
export class GroupBenchmark extends Benchmark implements Disposable {
  private readonly grouped: boolean;

  /** @internal */
  constructor(
    private readonly owner: ActionsLogger,
    private readonly title: string,
    private readonly level: LogLevel,
  ) {
    super();
    this.grouped = owner.startGroup(title);
  }

  /** Ends the group and logs the title with the elapsed time. */
  dispose(): void {
    if (this.grouped) {
      this.owner.endGroup();
    }

    this.owner.logLazy(this.level, () => `${this.title} (${this.getDeltaAsText()})`);
  }
}

/**
 * Logger for GitHub Actions workflows. Its level comes from the runner's debug setting
 * (`RUNNER_DEBUG`, `ACTIONS_STEP_DEBUG`), and cannot change while the step runs.
 */
export class ActionsLogger extends HostLogger {
  private readonly core: Core;
  private groupOpen = false;

  constructor(options: ActionsLoggerOptions = {}) {
    const core: Core = options.core ?? actionsCore;
    const host: Host = {
      createTransport: (format) => new ActionsTransport({ core, format }),
      getLevel: () => levelFromEnv(core, options.env),
    };
    super(host, { format: options.format ?? plainFormat, transports: options.transports });
    this.core = core;
  }

  /**
   * Starts a log group and a stopwatch. Dispose it, such as with `using`, to end the group and log
   * the time.
   *
   * @param title The group's title, also logged with the elapsed time.
   * @param level The level to log the time at. Defaults to `info`.
   */
  group(title: string, level: LogLevel = "info"): GroupBenchmark {
    return new GroupBenchmark(this, title, level);
  }

  /**
   * Opens a log group unless one is open already; groups can't nest.
   *
   * @internal
   * @returns Whether a group was opened, so the caller knows to end it.
   */
  startGroup(title: string): boolean {
    if (this.groupOpen) {
      return false;
    }

    this.groupOpen = true;
    this.core.startGroup(title);
    return true;
  }

  /** @internal */
  endGroup(): void {
    this.groupOpen = false;
    this.core.endGroup();
  }

  /** Masks a value in the workflow log from now on, such as a token read at runtime. */
  maskSecret(value: string): void {
    this.core.setSecret(value);
  }
}
