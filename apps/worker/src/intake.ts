import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import type { NormalizedEmail, NormalizedWhatsAppMessage } from "@andthenn/domain";

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }

type EvidenceWriter = (input: {
  organizationId: string;
  intakeItemId: string;
  sourceItemId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}) => Promise<{ storageKey: string; checksumSha256: string; sizeBytes: number }>;

interface IntakeEvidence {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

/** Persists normalized provider evidence before any AI or manager workflow sees it.
 * Provider message IDs are unique at the database boundary, making retries safe. */
export async function persistEmailIntake(sql: Sql, organizationId: string, email: NormalizedEmail, rawMessage?: Uint8Array, writeEvidence?: EvidenceWriter) {
  await sql.begin(async (tx) => {
    const existing = await tx<{ intake_item_id: string }[]>`select intake_item_id::text from intake_source_items where organization_id = ${organizationId}::uuid and provider = 'GMAIL' and provider_message_id = ${email.providerMessageId} limit 1`;
    if (existing[0]) return;
    const [item] = await tx<{ id: string }[]>`insert into intake_items (organization_id, source_channel, title, confirmed_summary)
      values (${organizationId}::uuid, 'EMAIL', ${email.subject}, ${email.text}) returning id::text`;
    const [source] = await tx<{ id: string }[]>`insert into intake_source_items (organization_id, intake_item_id, provider, provider_message_id, rfc_message_id, sender, forwarder, captured_at, sequence, kind, raw_text, raw_headers, content_hash, provider_payload)
      values (${organizationId}::uuid, ${item!.id}::uuid, 'GMAIL', ${email.providerMessageId}, ${email.rfcMessageId}, ${email.sender}, ${email.forwardedBy}, ${email.sentAt}, 0, 'EMAIL', ${email.text}, ${tx.json(email.rawHeaders)}::jsonb, ${digest(`${email.providerMessageId}:${email.text}`)}, ${tx.json({ recipients: email.recipients, attachments: email.attachments })}::jsonb)
      returning id::text`;
    if (rawMessage && writeEvidence) {
      const evidence = await writeEvidence({ organizationId, intakeItemId: item!.id, sourceItemId: source!.id, filename: `${email.providerMessageId}.eml`, contentType: "message/rfc822", bytes: rawMessage });
      await tx`insert into intake_attachments (organization_id, source_item_id, filename, content_type, size_bytes, checksum_sha256, storage_key)
        values (${organizationId}::uuid, ${source!.id}::uuid, ${`${email.providerMessageId}.eml`}, 'message/rfc822', ${evidence.sizeBytes}, ${evidence.checksumSha256}, ${evidence.storageKey})`;
    }
    await tx`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot)
      values (${organizationId}::uuid, 'intake.email_captured', 'INTAKE', ${item!.id}, 'WORKER', ${tx.json({ providerMessageId: email.providerMessageId, attachmentCount: email.attachments.length })}::jsonb)`;
  });
}

export async function persistWhatsAppIntake(sql: Sql, organizationId: string, message: NormalizedWhatsAppMessage, media?: IntakeEvidence, writeEvidence?: EvidenceWriter) {
  await sql.begin(async (tx) => {
    const existing = await tx<{ intake_item_id: string }[]>`select intake_item_id::text from intake_source_items where organization_id = ${organizationId}::uuid and provider = 'WHATSAPP' and provider_message_id = ${message.providerMessageId} limit 1`;
    if (existing[0]) return;
    const [item] = await tx<{ id: string }[]>`insert into intake_items (organization_id, source_channel, title, confirmed_summary)
      values (${organizationId}::uuid, 'WHATSAPP', ${message.text?.slice(0, 300) ?? `${message.kind} message`}, ${message.text}) returning id::text`;
    const [source] = await tx<{ id: string }[]>`insert into intake_source_items (organization_id, intake_item_id, provider, provider_message_id, sender, captured_at, sequence, kind, raw_text, raw_headers, content_hash, provider_payload)
      values (${organizationId}::uuid, ${item!.id}::uuid, 'WHATSAPP', ${message.providerMessageId}, ${message.senderNumber}, ${message.sentAt}, 0, ${message.kind}, ${message.text}, '{}'::jsonb, ${digest(`${message.sequenceKey}:${message.text ?? ""}`)}, ${tx.json({ mediaId: message.mediaId, sequenceKey: message.sequenceKey })}::jsonb)
      returning id::text`;
    if (media && writeEvidence) {
      const evidence = await writeEvidence({ organizationId, intakeItemId: item!.id, sourceItemId: source!.id, ...media });
      await tx`insert into intake_attachments (organization_id, source_item_id, filename, content_type, size_bytes, checksum_sha256, storage_key)
        values (${organizationId}::uuid, ${source!.id}::uuid, ${media.filename}, ${media.contentType}, ${evidence.sizeBytes}, ${evidence.checksumSha256}, ${evidence.storageKey})`;
    }
    await tx`insert into activity_events (organization_id, event_type, entity_type, entity_id, source, snapshot)
      values (${organizationId}::uuid, 'intake.whatsapp_captured', 'INTAKE', ${item!.id}, 'WORKER', ${tx.json({ providerMessageId: message.providerMessageId, mediaId: message.mediaId })}::jsonb)`;
  });
}
