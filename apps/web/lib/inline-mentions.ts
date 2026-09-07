type MentionMember = { id: string; name: string };
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Resolve only visible teammates. Ambiguous short names require a full name or explicit selection. */
export function inlineMentionIds(body: string, members: MentionMember[]) {
  const aliases = new Map<string, string[]>();
  for (const member of members) {
    const name = member.name.trim().normalize("NFC").toLocaleLowerCase();
    for (const alias of new Set([name, name.split(/\s+/)[0]!])) {
      if (!alias) continue;
      aliases.set(alias, [...(aliases.get(alias) ?? []), member.id]);
    }
  }
  const names = [...aliases.keys()].sort((a,b) => b.length - a.length);
  if (!names.length) return [];
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_@])@(${names.map(escapePattern).join("|")})(?![\\p{L}\\p{N}_@-]|\\.[\\p{L}\\p{N}])`, "giu");
  const ids = new Set<string>();
  for (const match of body.normalize("NFC").matchAll(pattern)) {
    const matches = aliases.get(match[2]!.toLocaleLowerCase())!;
    if (matches.length === 1) ids.add(matches[0]!);
  }
  return [...ids];
}
