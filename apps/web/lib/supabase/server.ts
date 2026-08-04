import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => { try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot write cookies. */ } },
    },
  });
}

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") throw new Error("Authentication is not configured");
    return { id: "00000000-0000-4000-8000-000000000001", email: "demo@andthenn.in" };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthenticated");
  return user;
}
