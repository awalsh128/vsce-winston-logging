import { getLocation, plainFormat } from "@awalsh128/winston-host";
import type { TransformableInfo } from "logform";
import { LEVEL, MESSAGE } from "triple-beam";
import * as winston from "winston";
import TransportStream from "winston-transport";
import { targetFromEnv, type CheckTarget } from "./check-target";

/** GitHub accepts at most this many annotations in one request. */
export const MAX_ANNOTATIONS_PER_REQUEST = 50;

/** An annotation as the Checks API takes it. */
export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  start_column?: number;
  end_column?: number;
  annotation_level: "warning" | "failure";
  message: string;
}

/** The output of a check run. */
export interface CheckOutput {
  title: string;
  summary: string;
  annotations: CheckAnnotation[];
}

/** How a finished check run is shown on the commit or pull request. */
export type CheckConclusion = "success" | "neutral" | "failure" | "action_required";

/**
 * The part of an Octokit (from `@actions/github`'s `getOctokit()` or `@octokit/rest`) that the
 * transport uses, so the package needs no Octokit dependency of its own.
 */
export interface ChecksOctokit {
  rest: {
    checks: {
      create(params: {
        owner: string;
        repo: string;
        name: string;
        head_sha: string;
        status: "completed";
        conclusion: CheckConclusion;
        output: CheckOutput;
      }): Promise<{ data: { id: number } }>;
      update(params: {
        owner: string;
        repo: string;
        check_run_id: number;
        output: CheckOutput;
      }): Promise<unknown>;
    };
  };
}

/** Options for `CheckRunTransport`. */
export interface CheckRunTransportOptions extends TransportStream.TransportStreamOptions {
  /** An Octokit with the Checks API, such as `github.getOctokit(token)`. */
  octokit: ChecksOctokit;
  /** The repository and commit to annotate. Defaults to `targetFromEnv()`. */
  target?: CheckTarget;
  /** The check run's name. Defaults to `Log annotations`. */
  name?: string;
  /** How the check run concludes. Defaults to `neutral`, so logged errors don't fail the commit's checks. */
  conclusion?: CheckConclusion;
}

/**
 * Winston transport that collects the errors and warnings that have a location, and reports them
 * as one check run with annotations when `flush()` is called.
 *
 * Workflow commands (`core.error`) show at most 10 errors and 10 warnings per step. The Checks API
 * takes any number of annotations, 50 per request, and shows them on the pull request's diff. The
 * workflow's token needs `checks: write`; pull requests from forks get a read-only token, so
 * `flush()` fails there.
 */
export class CheckRunTransport extends TransportStream {
  private readonly octokit: ChecksOctokit;
  private readonly target: CheckTarget;
  private readonly name: string;
  private readonly conclusion: CheckConclusion;
  private annotations: CheckAnnotation[] = [];

  constructor(opts: CheckRunTransportOptions) {
    // Without a format, Winston writes each line as JSON, which would become the annotation's message.
    super({ format: winston.format.printf(plainFormat), ...opts });
    this.octokit = opts.octokit;
    this.target = opts.target ?? targetFromEnv();
    this.name = opts.name ?? "Log annotations";
    this.conclusion = opts.conclusion ?? "neutral";
  }

  /** The number of annotations waiting for `flush()`. */
  get pending(): number {
    return this.annotations.length;
  }

  override log(info: TransformableInfo, next: () => void): void {
    setImmediate(() => this.emit("logged", info));
    const level = String(info[LEVEL] ?? info.level);
    const location = getLocation(info);
    if (location && (level === "error" || level === "warn")) {
      const line = location.line ?? 1;
      const endLine = location.endLine ?? line;
      const annotation: CheckAnnotation = {
        path: location.path,
        start_line: line,
        end_line: endLine,
        annotation_level: level === "error" ? "failure" : "warning",
        message: String(info[MESSAGE] ?? info.message ?? ""),
      };
      // GitHub only accepts columns on single-line annotations.
      const singleLine = endLine === line;
      if (location.column !== undefined && singleLine) {
        annotation.start_column = location.column;
        annotation.end_column = location.column;
      }

      this.annotations.push(annotation);
    }

    next();
  }

  /**
   * Reports the collected annotations as a check run, in batches of 50, and forgets them. Does
   * nothing when there are none.
   *
   * @returns The check run's id, or undefined when there was nothing to report.
   */
  async flush(): Promise<number | undefined> {
    const annotations = this.annotations;
    this.annotations = [];
    if (annotations.length === 0) {
      return undefined;
    }

    const errors = annotations.filter((a) => a.annotation_level === "failure").length;
    const output = (batch: CheckAnnotation[]): CheckOutput => ({
      title: this.name,
      summary: `${errors} error(s) and ${annotations.length - errors} warning(s) were logged.`,
      annotations: batch,
    });
    const { owner, repo, sha } = this.target;
    const { data } = await this.octokit.rest.checks.create({
      owner,
      repo,
      name: this.name,
      head_sha: sha,
      status: "completed",
      conclusion: this.conclusion,
      output: output(annotations.slice(0, MAX_ANNOTATIONS_PER_REQUEST)),
    });
    for (let i = MAX_ANNOTATIONS_PER_REQUEST; i < annotations.length; i += MAX_ANNOTATIONS_PER_REQUEST) {
      await this.octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: data.id,
        output: output(annotations.slice(i, i + MAX_ANNOTATIONS_PER_REQUEST)),
      });
    }

    return data.id;
  }
}
