import type { Metadata } from "next";
import { MediaReview } from "../../../components/media-review";
export const metadata: Metadata = { title: "Review Hero Film V2", robots: { index: false, follow: false } };
export default async function ReviewPage({params}:{params:Promise<{token:string}>}) { const {token}=await params; return <MediaReview token={token}/>; }
