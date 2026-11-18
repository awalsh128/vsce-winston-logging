/** Anything that can be cleaned up; matches `vscode.Disposable` and `using` declarations. */
export interface Disposable {
  dispose(): void;
}
