import type { Metadata } from "next";
import { MediaReview } from "../../../components/media-review";
import { and, createDatabase, eq, gt, isNull, or, reviewShares } from "@andthenn/db";
import { notFound } from "next/navigation";
import { assertRuntimeConfiguration } from "../../../lib/config";
import { hashReviewToken } from "../../../lib/security";
export const metadata: Metadata = { title: "Secure media review", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function ReviewPage({params}:{params:Promise<{token:string}>}) {
  assertRuntimeConfiguration();
  const {token}=await params;
  const { db } = createDatabase();
  const [share] = await db.select({ id: reviewShares.id }).from(reviewShares)
    .where(and(eq(reviewShares.tokenHash, hashReviewToken(token)), eq(reviewShares.status, "ACTIVE"), or(isNull(reviewShares.expiresAt), gt(reviewShares.expiresAt, new Date())))).limit(1);
  if (!share) notFound();
  return <MediaReview token={token}/>;
}
