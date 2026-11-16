/** Minimal stand-in for the `vscode` module so tests run in plain Node. */

export enum LogLevel {
  Off = 0,
  Trace = 1,
  Debug = 2,
  Info = 3,
  Warning = 4,
  Error = 5,
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }
}

export class Uri {
  private constructor(readonly fsPath: string) {}
  static file(fsPath: string): Uri {
    return new Uri(fsPath);
  }
}

type Listener<T> = (e: T) => void;

/** Fake LogOutputChannel recording each line as `[level, message]`. */
export class FakeLogOutputChannel {
  readonly lines: [string, string][] = [];
  shown = false;
  disposed = false;
  private listeners: Listener<LogLevel>[] = [];

  constructor(
    readonly name: string,
    public logLevel: LogLevel
  ) {}

  trace(m: string) { this.lines.push(["trace", m]); }
  debug(m: string) { this.lines.push(["debug", m]); }
  info(m: string) { this.lines.push(["info", m]); }
  warn(m: string) { this.lines.push(["warn", m]); }
  error(m: string) { this.lines.push(["error", m]); }
  appendLine(m: string) { this.lines.push(["line", m]); }
  show() { this.shown = true; }
  dispose() { this.disposed = true; }

  onDidChangeLogLevel(listener: Listener<LogLevel>) {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  /** Simulates the user changing the level with "Developer: Set Log Level...". */
  fireLogLevel(level: LogLevel) {
    this.logLevel = level;
    this.listeners.forEach((l) => l(level));
  }
}

/** Level new channels start at; tests may change it. */
export const state = { initialLevel: LogLevel.Info, lastChannel: undefined as FakeLogOutputChannel | undefined };

export const window = {
  createOutputChannel(name: string) {
    state.lastChannel = new FakeLogOutputChannel(name, state.initialLevel);
    return state.lastChannel;
  },
};

export const workspace = {
  workspaceFolders: undefined as { uri: Uri }[] | undefined,
  /** Settings returned by getConfiguration(), keyed by section; tests may change it. */
  settings: {} as Record<string, Record<string, unknown>>,
  getConfiguration(section: string) {
    return { ...workspace.settings[section], get: () => undefined, has: () => false };
  },
  asRelativePath(uri: Uri) {
    const root = workspace.workspaceFolders?.[0]?.uri.fsPath;
    return root && uri.fsPath.startsWith(root + "/") ? uri.fsPath.slice(root.length + 1) : uri.fsPath;
  },
};
