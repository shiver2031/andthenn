import { execFileSync } from "node:child_process";
const sha = process.env.RELEASE_SHA, repository = process.env.GITHUB_REPOSITORY;
if (!/^[0-9a-f]{40}$/.test(sha ?? "") || !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "")) throw new Error("Exact SHA and GitHub repository are required.");
if (execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() !== sha) throw new Error("Checkout does not match the requested commit.");
const result = JSON.parse(execFileSync("gh", ["api", `repos/${repository}/actions/workflows/quality.yml/runs?head_sha=${sha}&status=success`], { encoding: "utf8" }));
if (!result.workflow_runs?.some((run) => run.head_sha === sha && run.conclusion === "success")) throw new Error("Successful quality workflow evidence is required for this exact commit.");
