import { fileVersions, sql } from "@andthenn/db";
/** One publication predicate shared with worker archival and closure verification. */
export const isCurrentFinalFile = sql<boolean>`exists (select 1 from current_final_files f where f.file_version_id = ${fileVersions.id} and f.organization_id = ${fileVersions.organizationId})`;
