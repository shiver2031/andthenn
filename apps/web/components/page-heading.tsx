import { Badge } from "@andthenn/ui";
export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div>{eyebrow && <Badge tone="violet" className="mb-3">{eyebrow}</Badge>}<h1 className="display text-3xl font-bold text-zinc-950 md:text-4xl">{title}</h1>{description && <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{description}</p>}</div>{action}
  </div>;
}
