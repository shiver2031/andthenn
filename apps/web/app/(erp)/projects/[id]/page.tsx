import { redirect } from "next/navigation";

export default async function ProjectCompatibilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects?project=${id}`);
}
