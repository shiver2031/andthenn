import { LocalFilesystemStorage, SupabaseS3Storage } from "@andthenn/adapters";
import type { StorageProvider } from "@andthenn/domain";
import { prototypeRuntimeEnabled } from "./config";
export function createStorage(): StorageProvider {
  if (prototypeRuntimeEnabled()) return new LocalFilesystemStorage();
  const endpoint = process.env.SUPABASE_S3_ENDPOINT, accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY, bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("Storage is not configured");
  return new SupabaseS3Storage({ endpoint, accessKeyId, secretAccessKey, bucket, region: process.env.SUPABASE_S3_REGION ?? "ap-south-1" });
}
