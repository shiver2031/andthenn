export interface UploadRequest {
  organizationId: string;
  taskId: string;
  fileVersionId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface StorageProvider {
  initiateUpload(input: UploadRequest): Promise<{ uploadId: string; uploadUrl: string; expiresAt: Date }>;
  finalizeUpload(input: UploadRequest & { uploadId: string }): Promise<{ objectKey: string; etag: string }>;
  createSignedRead(objectKey: string, expiresInSeconds: number): Promise<string>;
  copyToArchive(sourceKey: string, destinationKey: string): Promise<{ destinationKey: string }>;
  quarantine(objectKey: string, restoreUntil: Date): Promise<void>;
  restore(objectKey: string): Promise<void>;
  deleteAfterRetention(objectKey: string): Promise<void>;
  metadata(objectKey: string): Promise<{ sizeBytes: number; checksumSha256: string | null; contentType: string }>;
  healthCheck(): Promise<{ healthy: boolean; detail: string }>;
}

export interface NormalizedEmail {
  providerMessageId: string;
  rfcMessageId: string | null;
  sender: string;
  recipients: readonly string[];
  forwardedBy: string | null;
  subject: string;
  sentAt: Date;
  rawHeaders: Readonly<Record<string, string>>;
  text: string;
  attachments: readonly { filename: string; contentType: string; providerAttachmentId: string; sizeBytes: number }[];
}

export interface InboundEmailProvider {
  subscribe(): Promise<{ historyCursor: string; expiresAt: Date }>;
  renew(): Promise<{ historyCursor: string; expiresAt: Date }>;
  reconcile(historyCursor: string): Promise<{ nextCursor: string; messages: readonly NormalizedEmail[] }>;
  fetchRaw(providerMessageId: string): Promise<Uint8Array>;
}

export interface NormalizedWhatsAppMessage {
  providerMessageId: string;
  senderNumber: string;
  sentAt: Date;
  kind: "TEXT" | "AUDIO" | "IMAGE" | "DOCUMENT" | "UNSUPPORTED";
  text: string | null;
  mediaId: string | null;
  sequenceKey: string;
}

export interface WhatsAppProvider {
  verifyWebhook(signature: string, rawBody: Uint8Array): Promise<boolean>;
  normalizeWebhook(payload: unknown): Promise<readonly NormalizedWhatsAppMessage[]>;
  retrieveMedia(mediaId: string): Promise<{ bytes: Uint8Array; contentType: string; filename: string | null }>;
  sendConfirmed(input: { recipient: string; message: string; reviewUrl: string }): Promise<{ providerMessageId: string }>;
}

export interface AiSuggestion<T> {
  value: T;
  confidence: number | null;
  sourceReferences: readonly string[];
  missingInformation: readonly string[];
  provider: string;
  model: string;
  usageUnits: number;
}

export interface AiAssistProvider {
  transcribe(input: { bytes: Uint8Array; contentType: string; languageHint?: string }): Promise<AiSuggestion<string>>;
  extractText(input: { bytes: Uint8Array; contentType: string }): Promise<AiSuggestion<string>>;
  suggestBrief(input: { rawText: string; knownClients: readonly string[]; knownProjects: readonly string[] }): Promise<AiSuggestion<{
    summary: string;
    clientId: string | null;
    projectId: string | null;
    intakeType: string | null;
    deliverables: readonly string[];
    tasks: readonly string[];
  }>>;
}

export interface JobEnvelope<T = unknown> {
  id: string;
  queue: string;
  queueMessageId?: string;
  type: string;
  idempotencyKey: string;
  correlationId: string;
  attempts: number;
  payload: T;
}

export interface JobQueue {
  enqueue<T>(job: Omit<JobEnvelope<T>, "attempts" | "queueMessageId">, delaySeconds?: number): Promise<void>;
  claim<T>(queue: string, visibilitySeconds: number, quantity: number): Promise<readonly JobEnvelope<T>[]>;
  complete(job: JobEnvelope): Promise<void>;
  retry(job: JobEnvelope, delaySeconds: number, reason: string): Promise<void>;
  fail(job: JobEnvelope, reason: string): Promise<void>;
  health(): Promise<{ queues: readonly { name: string; depth: number; oldestSeconds: number | null }[] }>;
}

export interface MediaProcessor {
  inspect(bytes: Uint8Array, declaredContentType: string): Promise<{ contentType: string; durationMs: number | null; width: number | null; height: number | null }>;
  createThumbnail(bytes: Uint8Array, contentType: string): Promise<Uint8Array>;
  createProxy(bytes: Uint8Array, contentType: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  createWaveform(bytes: Uint8Array, contentType: string): Promise<readonly number[]>;
}

export interface NotificationChannel {
  send(input: { recipient: string; subject?: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }>;
}
