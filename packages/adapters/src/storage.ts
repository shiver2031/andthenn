import {
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { StorageProvider, UploadRequest } from "@andthenn/domain";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class SupabaseS3Storage implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  private objectKey(input: UploadRequest) {
    const safeName = input.filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
    return `org/${input.organizationId}/tasks/${input.taskId}/versions/${input.fileVersionId}/${safeName}`;
  }

  private async verifyObject(input: UploadRequest, objectKey: string) {
    const object = await this.client.send(new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
    const body = object.Body as AsyncIterable<Uint8Array> | undefined;
    if (!body || typeof body[Symbol.asyncIterator] !== "function") throw new Error("Storage did not return uploaded object bytes");
    const digest = createHash("sha256");
    let size = 0;
    for await (const chunk of body) {
      size += chunk.byteLength;
      digest.update(chunk);
    }
    if (size !== input.sizeBytes) throw new Error("Uploaded object size does not match");
    if (digest.digest("hex") !== input.checksumSha256) throw new Error("Uploaded object checksum does not match");
  }

  async initiateUpload(input: UploadRequest) {
    const objectKey = this.objectKey(input);
    const expiresIn = 900;
    const multipartThreshold = 25 * 1024 * 1024;
    if (input.sizeBytes > multipartThreshold) {
      const created = await this.client.send(new CreateMultipartUploadCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        ContentType: input.contentType,
        Metadata: { sha256: input.checksumSha256, "file-version-id": input.fileVersionId },
      }));
      if (!created.UploadId) throw new Error("Storage did not create a multipart upload");
      const partSize = 8 * 1024 * 1024;
      const partCount = Math.ceil(input.sizeBytes / partSize);
      const parts = await Promise.all(Array.from({ length: partCount }, async (_, index) => {
        const partNumber = index + 1;
        return { partNumber, uploadUrl: await getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.config.bucket, Key: objectKey, UploadId: created.UploadId, PartNumber: partNumber }), { expiresIn }) };
      }));
      return { uploadId: created.UploadId, mode: "MULTIPART" as const, parts, expiresAt: new Date(Date.now() + expiresIn * 1_000) };
    }
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      Metadata: { sha256: input.checksumSha256, "file-version-id": input.fileVersionId },
    });
    return {
      uploadId: Buffer.from(objectKey).toString("base64url"),
      mode: "SINGLE" as const,
      uploadUrl: await getSignedUrl(this.client, command, { expiresIn }),
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  async finalizeUpload(input: UploadRequest & { uploadId: string; parts?: readonly { partNumber: number; etag: string }[] }) {
    const objectKey = this.objectKey(input);
    let alreadyFinalized = false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
      alreadyFinalized = true;
    } catch {
      // The object is expected to be absent until a direct or multipart upload
      // is finalized. The later verification call is the authoritative check.
    }
    if (!alreadyFinalized && input.parts?.length) {
      const ordered = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
      if (ordered.some((part, index) => part.partNumber !== index + 1)) throw new Error("Multipart completion parts must be contiguous");
      await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.config.bucket, Key: objectKey, UploadId: input.uploadId, MultipartUpload: { Parts: ordered.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) } }));
    } else if (!alreadyFinalized) {
      const encodedKey = Buffer.from(input.uploadId, "base64url").toString("utf8");
      if (encodedKey !== objectKey) throw new Error("Upload identity does not match the immutable file version");
    }
    const metadata = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
    if (metadata.ContentLength !== input.sizeBytes) throw new Error("Uploaded object size does not match");
    await this.verifyObject(input, objectKey);
    return { objectKey, etag: metadata.ETag?.replaceAll('"', "") ?? input.checksumSha256 };
  }

  createSignedRead(objectKey: string, expiresInSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }), { expiresIn: expiresInSeconds });
  }

  async openRead(objectKey: string, range?: string) {
    const object = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      ...(range ? { Range: range } : {}),
    }));
    if (!object.Body) throw new Error("Storage did not return object bytes");
    const source = object.Body as Readable;
    if (typeof source[Symbol.asyncIterator] !== "function") throw new Error("Storage returned an unsupported object stream");
    return {
      body: Readable.toWeb(source) as ReadableStream<Uint8Array>,
      contentLength: Number(object.ContentLength ?? 0),
      contentRange: object.ContentRange ?? null,
      contentType: object.ContentType ?? "application/octet-stream",
      etag: object.ETag?.replaceAll('"', "") ?? null,
    };
  }

  async storeEvidence(input: {
    organizationId: string;
    intakeItemId: string;
    sourceItemId: string;
    filename: string;
    contentType: string;
    bytes: Uint8Array;
  }) {
    const safeName = input.filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "evidence.bin";
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    const objectKey = `org/${input.organizationId}/intake/${input.intakeItemId}/sources/${input.sourceItemId}/${safeName}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      Body: input.bytes,
      ContentType: input.contentType,
      ContentLength: input.bytes.byteLength,
      Metadata: { sha256: checksumSha256, "intake-source-id": input.sourceItemId },
    }));
    await this.verifyObject({
      organizationId: input.organizationId,
      taskId: input.intakeItemId,
      fileVersionId: input.sourceItemId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      checksumSha256,
    }, objectKey);
    return { storageKey: objectKey, checksumSha256, sizeBytes: input.bytes.byteLength };
  }

  async copyToArchive(sourceKey: string, destinationKey: string) {
    await this.client.send(new CopyObjectCommand({
      Bucket: this.config.bucket,
      Key: destinationKey,
      CopySource: `${this.config.bucket}/${encodeURIComponent(sourceKey).replaceAll("%2F", "/")}`,
      MetadataDirective: "COPY",
    }));
    return { destinationKey };
  }

  async quarantine(objectKey: string, restoreUntil: Date) {
    const destinationKey = `quarantine/${restoreUntil.toISOString().slice(0, 10)}/${objectKey}`;
    await this.copyToArchive(objectKey, destinationKey);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
  }

  async restore(objectKey: string) {
    const marker = objectKey.indexOf("/org/");
    if (!objectKey.startsWith("quarantine/") || marker < 0) throw new Error("Invalid quarantine key");
    await this.copyToArchive(objectKey, objectKey.slice(marker + 1));
  }

  async deleteAfterRetention(objectKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
  }

  async metadata(objectKey: string) {
    const value = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
    return {
      sizeBytes: value.ContentLength ?? 0,
      checksumSha256: value.Metadata?.sha256 ?? null,
      contentType: value.ContentType ?? "application/octet-stream",
    };
  }

  async healthCheck() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return { healthy: true, detail: "Storage bucket reachable" };
    } catch (error) {
      return { healthy: false, detail: error instanceof Error ? error.message : "Storage check failed" };
    }
  }
}
