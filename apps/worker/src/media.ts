import type { StorageProvider } from "@andthenn/domain";
import type { Sql } from "postgres";

export interface MediaInspection {
  clean: boolean;
  detectedContentType: string;
  metadata?: Record<string, unknown>;
  thumbnailStorageKey?: string | null;
  proxyStorageKey?: string | null;
}

export function validateMediaInspection(input: { expectedSize: number; expectedChecksum: string; declaredContentType: string; actualSize: number; actualChecksum: string | null; inspection: MediaInspection }) {
  if (input.actualSize !== input.expectedSize) throw new Error("Stored media length does not match the immutable version");
  if (input.actualChecksum !== input.expectedChecksum) throw new Error("Stored media checksum does not match the immutable version");
  if (!input.inspection.clean) throw new Error("Malware inspection rejected the uploaded media");
  const declaredFamily = input.declaredContentType.split("/")[0], detectedFamily = input.inspection.detectedContentType.split("/")[0];
  if (!input.inspection.detectedContentType.includes("/") || (declaredFamily !== detectedFamily && input.declaredContentType !== "application/octet-stream")) throw new Error("Detected media type conflicts with the declared type");
}

export async function processMediaVersion(sql: Sql, storage: StorageProvider, fileVersionId: string, inspect: (input: { signedUrl: string; filename: string; declaredContentType: string; checksumSha256: string }) => Promise<MediaInspection>) {
  const rows = await sql<{ id: string; organization_id: string; filename: string; content_type: string; size_bytes: number; checksum_sha256: string; storage_key: string; processing_status: string }[]>`
    select id::text, organization_id::text, filename, content_type, size_bytes::int, checksum_sha256, storage_key, processing_status
    from file_versions where id = ${fileVersionId}::uuid limit 1`;
  const version = rows[0]; if (!version) throw new Error("Media version not found"); if (version.processing_status === "READY") return;
  await sql`update file_versions set processing_status = 'PROCESSING', processing_failure_detail = null where id = ${fileVersionId}::uuid`;
  try {
    const actual = await storage.metadata(version.storage_key);
    const signedUrl = await storage.createSignedRead(version.storage_key, 600);
    const inspection = await inspect({ signedUrl, filename: version.filename, declaredContentType: version.content_type, checksumSha256: version.checksum_sha256 });
    validateMediaInspection({ expectedSize: version.size_bytes, expectedChecksum: version.checksum_sha256, declaredContentType: version.content_type, actualSize: actual.sizeBytes, actualChecksum: actual.checksumSha256, inspection });
    await sql`update file_versions set processing_status = 'READY', detected_content_type = ${inspection.detectedContentType}, malware_status = 'CLEAN', media_metadata = ${sql.json(JSON.parse(JSON.stringify(inspection.metadata ?? {})))}::jsonb, thumbnail_storage_key = ${inspection.thumbnailStorageKey ?? null}, proxy_storage_key = ${inspection.proxyStorageKey ?? null}, ready_at = now(), processing_failure_detail = null where id = ${fileVersionId}::uuid`;
    await sql`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot) values (${version.organization_id}::uuid, 'file.version_ready', 'FILE_VERSION', ${fileVersionId}, 'WORKER', ${sql.json({ detectedContentType: inspection.detectedContentType })}::jsonb)`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Media processing failed";
    await sql`update file_versions set processing_status = 'FAILED', malware_status = 'UNKNOWN', processing_failure_detail = ${detail} where id = ${fileVersionId}::uuid`;
    throw error;
  }
}
