import { existsSync, readFileSync } from "node:fs";

/** The repository and commit a check run is attached to. */
export interface CheckTarget {
  owner: string;
  repo: string;
  /** The commit to annotate. For pull requests, the head commit, which is what the diff shows. */
  sha: string;
}

/** The head commit of the pull request the run is for, or undefined when it isn't for one. */
function readPullRequestHeadSha(env: NodeJS.ProcessEnv): string | undefined {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath || !existsSync(eventPath)) {
    return undefined;
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
    pull_request?: { head?: { sha?: string } };
  };
  return event.pull_request?.head?.sha;
}

/**
 * Reads the target from the environment of a workflow run: `GITHUB_REPOSITORY`, and the pull
 * request's head commit from the event payload when there is one, otherwise `GITHUB_SHA`.
 *
 * @throws When the repository or commit can't be determined, or the event payload isn't JSON.
 */
export function targetFromEnv(env: NodeJS.ProcessEnv = process.env): CheckTarget {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? "").split("/");
  const sha = readPullRequestHeadSha(env) ?? env.GITHUB_SHA;
  if (!owner || !repo || !sha) {
    throw new Error(
      "Can't tell the repository and commit to annotate; set GITHUB_REPOSITORY and GITHUB_SHA.",
    );
  }
  return { owner, repo, sha };
}
