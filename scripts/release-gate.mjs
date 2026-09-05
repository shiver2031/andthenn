import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const required = ["production-role-mapping", "client-access-grants", "manager-finance-grants", "finance-definitions", "standalone-task-scope", "retention-privacy", "platform-ownership", "provider-sandboxes", "backup-recovery", "performance-accessibility", "uat-founder", "uat-manager", "uat-designer", "uat-client"];
// Production supplies an external, reviewed attestation so the release commit
// does not need to contain its own (impossible self-referential) commit hash.
const record = JSON.parse(await readFile(process.env.RELEASE_APPROVAL_PATH ?? new URL("../docs/release-approvals.json", import.meta.url), "utf8"));
const failures = [];
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (record.releaseCommit !== commit) failures.push("Approval record must name the exact release commit.");
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) failures.push("Release worktree must be clean and reviewed.");
for (const key of required) {
  const entry = record.approvals?.[key];
  if (!entry || entry.status !== "approved" || !entry.approvedBy?.trim() || !entry.evidence?.trim() || !Number.isFinite(Date.parse(entry.approvedAt)) || Date.parse(entry.approvedAt) > Date.now()) failures.push(`${key}: named approval, date and evidence are required.`);
}
if (process.env.RELEASE_REQUIRE_ARTIFACTS === "1") {
  for (const key of ["webImage", "workerImage", "migrationImage"]) if (!/^[-a-zA-Z0-9._/:]+@sha256:[a-f0-9]{64}$/.test(record.artifacts?.[key] ?? "")) failures.push(`${key}: an immutable approved image digest is required.`);
  for (const key of ["quality", "browser", "migrations", "authentication", "providers", "storage", "recovery", "performance", "accessibility", "data-api", "uat"]) {
    const check = record.checks?.[key];
    if (check?.status !== "passed" || check.releaseCommit !== commit || !check.evidence?.trim()) failures.push(`${key}: passing evidence for the release commit is required.`);
  }
}
if (failures.length) {
  process.stderr.write(`RELEASE BLOCKED\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write("Approval record is complete for this commit. Verify signatory identity and deploy only through the approved platform process.\n");
