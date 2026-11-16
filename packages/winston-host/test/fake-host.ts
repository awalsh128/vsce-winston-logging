import type { Disposable, Host, Location, LogLevel, LogLevelOrOff } from "../src";

export type Line = [level: string, message: string];

/** Host that records lines and lets tests change its level, like a real host would. */
export class FakeHost implements Host {
  readonly lines: Line[] = [];
  readonly locations: (Location | undefined)[] = [];
  disposed = false;
  subscribed = false;
  private listener?: (level: LogLevelOrOff) => void;

  /** Absent when the host's level can't change. */
  onLevelChange?: (listener: (level: LogLevelOrOff) => void) => Disposable;

  constructor(
    public level: LogLevelOrOff = "info",
    observable = true,
  ) {
    if (observable) {
      this.onLevelChange = (listener) => {
        this.listener = listener;
        this.subscribed = true;
        return { dispose: () => ((this.listener = undefined), (this.subscribed = false)) };
      };
    }
  }

  readonly sink = {
    write: (level: LogLevel, message: string, location?: Location) => {
      this.lines.push([level, message]);
      this.locations.push(location);
    },
  };

  getLevel(): LogLevelOrOff {
    return this.level;
  }

  dispose(): void {
    this.disposed = true;
  }

  /** Simulates the host changing its level. */
  fireLevel(level: LogLevelOrOff): void {
    this.level = level;
    this.listener?.(level);
  }
}
