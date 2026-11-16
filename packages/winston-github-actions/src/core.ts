/** The properties of a workflow annotation, as `@actions/core` takes them. */
export interface AnnotationProperties {
  title?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
}

/** The part of `@actions/core` the adapter uses, so tests and other versions can stand in for it. */
export interface Core {
  info(message: string): void;
  debug(message: string): void;
  warning(message: string | Error, properties?: AnnotationProperties): void;
  error(message: string | Error, properties?: AnnotationProperties): void;
  isDebug(): boolean;
  startGroup(name: string): void;
  endGroup(): void;
  setSecret(secret: string): void;
}
