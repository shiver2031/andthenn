import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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

  async initiateUpload(input: UploadRequest) {
    const objectKey = this.objectKey(input);
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.sizeBytes,
      Metadata: { sha256: input.checksumSha256, "file-version-id": input.fileVersionId },
    });
    const expiresIn = 900;
    return {
      uploadId: Buffer.from(objectKey).toString("base64url"),
      uploadUrl: await getSignedUrl(this.client, command, { expiresIn }),
      expiresAt: new Date(Date.now() + expiresIn * 1_000),
    };
  }

  async finalizeUpload(input: UploadRequest & { uploadId: string }) {
    const objectKey = Buffer.from(input.uploadId, "base64url").toString("utf8");
    if (objectKey !== this.objectKey(input)) throw new Error("Upload identity does not match the immutable file version");
    const metadata = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey }));
    if (metadata.ContentLength !== input.sizeBytes) throw new Error("Uploaded object size does not match");
    if (metadata.Metadata?.sha256 !== input.checksumSha256) throw new Error("Uploaded checksum metadata does not match");
    return { objectKey, etag: metadata.ETag?.replaceAll('"', "") ?? input.checksumSha256 };
  }

  createSignedRead(objectKey: string, expiresInSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey }), { expiresIn: expiresInSeconds });
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
