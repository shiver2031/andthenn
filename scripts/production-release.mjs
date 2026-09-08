import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
process.env.RELEASE_REQUIRE_ARTIFACTS = "1";
execFileSync(process.execPath, ["scripts/release-gate.mjs"], { stdio: "inherit", env: process.env });
const record = JSON.parse(await readFile(process.env.RELEASE_APPROVAL_PATH, "utf8"));
const { GCP_PROJECT_ID: project, GCP_REGION: region, GCP_MIGRATION_JOB: migrationJob, RELEASE_MODE: mode } = process.env;
if (!project || !region || !migrationJob || !["canary", "promote"].includes(mode)) throw new Error("Configure the approved GCP project, region, migration job and rollout mode.");
const cloud = (...args) => execFileSync("gcloud", [...args, "--project", project, "--region", region, "--quiet"], { encoding: "utf8" });
const service = () => JSON.parse(cloud("run", "services", "describe", "andthenn-web", "--format=json"));
const suffix = `crm-${record.releaseCommit.slice(0,12)}`, revision = `andthenn-web-${suffix}`;
if (mode === "canary") {
  const before = service(), serving = before.status.traffic.filter((entry) => entry.percent > 0);
  if (serving.length !== 1 || serving[0].percent !== 100) throw new Error("Resolve the existing rollout before starting another canary.");
  const compatibility = record.checks?.compatibility;
  if (compatibility?.status !== "passed" || compatibility.releaseCommit !== record.releaseCommit || !compatibility.evidence) throw new Error("Staged compatibility evidence is required before sharing traffic or migrating the serving baseline.");
  const currentImage = cloud("run", "revisions", "describe", serving[0].revisionName, "--format=value(spec.containers[0].image)").trim();
  const worker = JSON.parse(cloud("run", "services", "describe", "andthenn-worker", "--format=json"));
  const workerImage = worker.spec.template.spec.containers[0].image;
  if (!record.compatibleBaseline?.webImages?.includes(currentImage) || !record.compatibleBaseline?.workerImages?.includes(workerImage)) throw new Error("The serving web and worker images are not in the approved compatible baseline. Use the rehearsed controlled cutover process.");
  cloud("run", "jobs", "update", migrationJob, "--image", record.artifacts.migrationImage, "--command=node", "--args=--import,tsx,packages/db/src/migrate.ts");
  cloud("run", "jobs", "execute", migrationJob, "--wait");
  cloud("run", "deploy", "andthenn-web", "--image", record.artifacts.webImage, "--no-traffic", "--tag", "candidate", "--revision-suffix", suffix);
  const candidate = service().status.traffic.find((entry) => entry.tag === "candidate");
  if (!candidate?.url || candidate.revisionName !== revision) throw new Error("Candidate revision was not established.");
  const response = await fetch(`${candidate.url}/api/health/ready`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Candidate readiness failed. Production web traffic remains unchanged.");
  cloud("run", "deploy", "andthenn-worker", "--image", record.artifacts.workerImage, "--revision-suffix", suffix);
  cloud("run", "services", "update-traffic", "andthenn-web", "--to-revisions", `${revision}=5,${serving[0].revisionName}=95`);
  const summary = { releaseCommit: record.releaseCommit, candidate: revision, previous: serving[0].revisionName, percent: 5, state: "Awaiting monitored canary acceptance" };
  await writeFile(`${process.env.RUNNER_TEMP ?? "/tmp"}/andthenn-rollout.json`, JSON.stringify(summary, null, 2));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
} else {
  if (record.checks?.canary?.status !== "passed" || !record.checks.canary.evidence || record.checks.canary.releaseCommit !== record.releaseCommit) throw new Error("Named, exact-commit canary evidence is required before promotion.");
  const image = cloud("run", "revisions", "describe", revision, "--format=value(spec.containers[0].image)").trim();
  if (image !== record.artifacts.webImage) throw new Error("Candidate digest differs from the approved image.");
  cloud("run", "services", "update-traffic", "andthenn-web", "--to-revisions", `${revision}=100`);
  process.stdout.write("Approved canary promoted to 100 percent. Continue production monitoring.\n");
}
