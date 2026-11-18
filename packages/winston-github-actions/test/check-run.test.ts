import { expect } from "chai";
import { getOctokit } from "@actions/github";
import {
  ActionsLogger,
  CheckRunTransport,
  MAX_ANNOTATIONS_PER_REQUEST,
  type ChecksOctokit,
  type Core,
} from "../src";

/** Lets the transports flush, since winston writes asynchronously. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

type Call = { method: "create" | "update"; params: Record<string, any> };

/** Fake Octokit recording the Checks API calls. */
function fakeOctokit(): ChecksOctokit & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    rest: {
      checks: {
        create: async (params) => (calls.push({ method: "create", params }), { data: { id: 7 } }),
        update: async (params) => void calls.push({ method: "update", params }),
      },
    },
  };
}

const target = { owner: "o", repo: "r", sha: "abc123" };
const quietCore = { info() {}, debug() {}, warning() {}, error() {}, isDebug: () => false, startGroup() {}, endGroup() {}, setSecret() {} } as Core;

describe("CheckRunTransport", () => {
  let octokit: ReturnType<typeof fakeOctokit>;
  let transport: CheckRunTransport;
  let logger: ActionsLogger;

  beforeEach(() => {
    octokit = fakeOctokit();
    transport = new CheckRunTransport({ octokit, target });
    logger = new ActionsLogger({ core: quietCore, env: {}, transports: [transport] });
  });
  afterEach(() => logger.dispose());

  it("reports located errors and warnings as one check run", async () => {
    logger.forLocation({ path: "src/a.ts", line: 3, endLine: 6 }).error("bad");
    logger.forLocation({ path: "src/b.ts", line: 9, column: 4 }).warn("iffy");
    await flush();
    const id = await transport.flush();

    expect(id).to.equal(7);
    expect(octokit.calls).to.have.length(1);
    expect(octokit.calls[0]!.params).to.deep.include({
      owner: "o",
      repo: "r",
      name: "Log annotations",
      head_sha: "abc123",
      status: "completed",
      conclusion: "neutral",
    });
    expect(octokit.calls[0]!.params.output).to.deep.equal({
      title: "Log annotations",
      summary: "1 error(s) and 1 warning(s) were logged.",
      annotations: [
        { path: "src/a.ts", start_line: 3, end_line: 6, annotation_level: "failure", message: "bad" },
        { path: "src/b.ts", start_line: 9, end_line: 9, start_column: 4, end_column: 4, annotation_level: "warning", message: "iffy" },
      ],
    });
  });

  it("ignores lines without a location and levels other than error and warn", async () => {
    logger.error("no location");
    logger.forLocation({ path: "a.ts", line: 1 }).info("info");
    await flush();

    expect(transport.pending).to.equal(0);
    expect(await transport.flush()).to.be.undefined;
    expect(octokit.calls).to.be.empty;
  });

  it("annotates line 1 when the location has no line, and drops columns on multi-line ranges", async () => {
    logger.forLocation({ path: "a.ts" }).warn("whole file");
    logger.forLocation({ path: "b.ts", line: 2, endLine: 4, column: 3 }).warn("span");
    await flush();
    await transport.flush();

    const [file, span] = octokit.calls[0]!.params.output.annotations;
    expect(file).to.deep.include({ start_line: 1, end_line: 1 });
    expect(span).to.not.have.any.keys("start_column", "end_column");
  });

  it("sends annotations in batches of 50, appending to the same check run", async () => {
    const located = logger.forLocation({ path: "a.ts", line: 1 });
    for (let i = 0; i < 120; i++) located.warn(`w${i}`);
    await flush();
    await transport.flush();

    expect(octokit.calls.map((c) => c.method)).to.deep.equal(["create", "update", "update"]);
    expect(octokit.calls.map((c) => c.params.output.annotations.length)).to.deep.equal([50, 50, 20]);
    expect(octokit.calls[1]!.params.check_run_id).to.equal(7);
    expect(octokit.calls[0]!.params.output.annotations.length).to.equal(MAX_ANNOTATIONS_PER_REQUEST);
  });

  it("forgets what it reported, so a second flush reports only new lines", async () => {
    logger.forLocation({ path: "a.ts", line: 1 }).error("first");
    await flush();
    await transport.flush();
    await transport.flush();

    expect(octokit.calls).to.have.length(1);
  });

  it("uses the configured name and conclusion", async () => {
    const custom = new CheckRunTransport({ octokit, target, name: "Lint", conclusion: "failure" });
    const customLogger = new ActionsLogger({ core: quietCore, env: {}, transports: [custom] });
    customLogger.forLocation({ path: "a.ts", line: 1 }).error("x");
    await flush();
    await custom.flush();
    customLogger.dispose();

    expect(octokit.calls[0]!.params).to.deep.include({ name: "Lint", conclusion: "failure" });
  });

  describe("with a real Octokit", () => {
    it("sends the REST requests the Checks API expects", async () => {
      const requests: { method: string; url: string; body: any }[] = [];
      const fetch = async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ method: String(init?.method), url: String(url), body: JSON.parse(String(init?.body ?? "null")) });
        return new Response(JSON.stringify({ id: 42 }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const real = new CheckRunTransport({
        octokit: getOctokit("token", { request: { fetch } }),
        target,
      });
      const realLogger = new ActionsLogger({ core: quietCore, env: {}, transports: [real] });
      const located = realLogger.forLocation({ path: "a.ts", line: 1 });
      for (let i = 0; i < 51; i++) located.error(`e${i}`);
      await flush();
      const id = await real.flush();
      realLogger.dispose();

      expect(id).to.equal(42);
      expect(requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).to.deep.equal([
        "POST /repos/o/r/check-runs",
        "PATCH /repos/o/r/check-runs/42",
      ]);
      expect(requests[0]!.body).to.deep.include({ name: "Log annotations", head_sha: "abc123", conclusion: "neutral" });
      expect(requests[0]!.body.output.annotations).to.have.length(50);
      expect(requests[1]!.body.output.annotations).to.have.length(1);
    });
  });
});
