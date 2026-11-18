import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import { targetFromEnv } from "../src";

describe("targetFromEnv", () => {
  const event = (payload: object) => {
    const file = join(mkdtempSync(join(tmpdir(), "event-")), "event.json");
    writeFileSync(file, JSON.stringify(payload));
    return file;
  };

  it("uses GITHUB_REPOSITORY and GITHUB_SHA", () => {
    expect(targetFromEnv({ GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "merge" })).to.deep.equal({ owner: "o", repo: "r", sha: "merge" });
  });

  it("uses a pull request's head commit over GITHUB_SHA", () => {
    const env = { GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "merge", GITHUB_EVENT_PATH: event({ pull_request: { head: { sha: "head" } } }) };
    expect(targetFromEnv(env).sha).to.equal("head");
  });

  it("an event without a pull request keeps GITHUB_SHA", () => {
    const env = { GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "push", GITHUB_EVENT_PATH: event({ ref: "x" }) };
    expect(targetFromEnv(env).sha).to.equal("push");
  });

  it("an event payload that isn't JSON throws", () => {
    const file = join(mkdtempSync(join(tmpdir(), "event-")), "event.json");
    writeFileSync(file, "not json");
    const env = { GITHUB_REPOSITORY: "o/r", GITHUB_SHA: "x", GITHUB_EVENT_PATH: file };
    expect(() => targetFromEnv(env)).to.throw(SyntaxError);
  });

  it("missing repository or commit throws", () => {
    expect(() => targetFromEnv({ GITHUB_REPOSITORY: "o/r" })).to.throw("Can't tell the repository and commit");
    expect(() => targetFromEnv({ GITHUB_SHA: "x" })).to.throw("Can't tell the repository and commit");
  });
});
