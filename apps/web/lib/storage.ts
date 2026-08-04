import { SupabaseS3Storage } from "@andthenn/adapters";
export function createStorage() {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT, accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID, secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY, bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) throw new Error("Storage is not configured");
  return new SupabaseS3Storage({ endpoint, accessKeyId, secretAccessKey, bucket, region: process.env.SUPABASE_S3_REGION ?? "ap-south-1" });
}
