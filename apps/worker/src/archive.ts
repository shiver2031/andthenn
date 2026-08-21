import type { StorageProvider } from "@andthenn/domain";
import type { Sql } from "postgres";

export function archiveDestinationKey(
  prefix: string,
  fileVersionId: string,
  filename: string,
) {
  const cleanPrefix = prefix.replace(/\/+$/, "");
  if (!cleanPrefix.startsWith("archive/org/") || cleanPrefix.includes(".."))
    throw new Error("Invalid archive destination prefix");
  const safeName = filename
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);
  return `${cleanPrefix}/approved/${fileVersionId}/${safeName}`;
}

export async function runArchiveJob(
  sql: Sql,
  storage: StorageProvider,
  archiveJobId: string,
) {
  const jobs = await sql<
    {
      id: string;
      organization_id: string;
      project_id: string;
      destination_prefix: string;
      status: string;
    }[]
  >`
    update archive_jobs set status = 'RUNNING', started_at = coalesce(started_at, now()), failure_detail = null, updated_at = now()
    where id = ${archiveJobId}::uuid and status in ('QUEUED','RETRYING','FAILED')
    returning id::text, organization_id::text, project_id::text, destination_prefix, status`;
  const job = jobs[0];
  if (!job) {
    const existing = await sql<
      { status: string }[]
    >`select status from archive_jobs where id = ${archiveJobId}::uuid limit 1`;
    if (existing[0]?.status === "SUCCEEDED") return;
    throw new Error("Archive job is unavailable or already running");
  }
  try {
    const versions = await sql<
      {
        id: string;
        filename: string;
        storage_key: string;
        checksum_sha256: string;
      }[]
    >`
      select distinct v.id::text, v.filename, v.storage_key, v.checksum_sha256
      from file_approvals a
      join file_versions v on v.id = a.file_version_id and v.organization_id = a.organization_id
      join tasks t on t.id = a.task_id and t.organization_id = a.organization_id
      join deliverables d on d.id = t.deliverable_id and d.organization_id = a.organization_id
      where d.project_id = ${job.project_id}::uuid and a.organization_id = ${job.organization_id}::uuid
        and a.reopened_at is null and v.locked_at is not null and v.processing_status = 'READY'
      order by v.id`;
    if (!versions.length)
      throw new Error(
        "Project has no active approved file versions to archive",
      );
    for (const version of versions) {
      const destinationKey = archiveDestinationKey(
        job.destination_prefix,
        version.id,
        version.filename,
      );
      await sql`insert into archive_manifest_entries (organization_id, archive_job_id, file_version_id, source_storage_key, destination_storage_key, expected_checksum_sha256)
        values (${job.organization_id}::uuid, ${job.id}::uuid, ${version.id}::uuid, ${version.storage_key}, ${destinationKey}, ${version.checksum_sha256})
        on conflict (archive_job_id, file_version_id) do nothing`;
      const [entry] = await sql<
        { status: string }[]
      >`select status from archive_manifest_entries where archive_job_id = ${job.id}::uuid and file_version_id = ${version.id}::uuid`;
      if (entry?.status === "VERIFIED") continue;
      try {
        await storage.copyToArchive(version.storage_key, destinationKey);
        const metadata = await storage.metadata(destinationKey);
        if (metadata.checksumSha256 !== version.checksum_sha256)
          throw new Error(
            "Archived object checksum does not match its approved source",
          );
        await sql`update archive_manifest_entries set status = 'VERIFIED', verified_checksum_sha256 = ${metadata.checksumSha256}, failure_detail = null, updated_at = now()
          where archive_job_id = ${job.id}::uuid and file_version_id = ${version.id}::uuid`;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Archive copy failed";
        await sql`update archive_manifest_entries set status = 'FAILED', failure_detail = ${detail}, updated_at = now()
          where archive_job_id = ${job.id}::uuid and file_version_id = ${version.id}::uuid`;
        throw error;
      }
    }
    const [summary] = await sql<
      { total: number; verified: number }[]
    >`select count(*)::int total, count(*) filter (where status = 'VERIFIED')::int verified from archive_manifest_entries where archive_job_id = ${job.id}::uuid`;
    if (!summary || summary.total !== summary.verified)
      throw new Error("Archive manifest verification is incomplete");
    await sql`update archive_jobs set status = 'SUCCEEDED', completed_at = now(), manifest = ${sql.json({ total: summary.total, verified: summary.verified, destinationPrefix: job.destination_prefix })}::jsonb, failure_detail = null, updated_at = now() where id = ${job.id}::uuid`;
    await sql`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot)
      values (${job.organization_id}::uuid, 'project.archive_verified', 'ARCHIVE_JOB', ${job.id}, 'WORKER', ${sql.json({ projectId: job.project_id, total: summary.total })}::jsonb)`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Archive failed";
    await sql`update archive_jobs set status = 'FAILED', failure_detail = ${detail}, updated_at = now() where id = ${job.id}::uuid`;
    throw error;
  }
}
