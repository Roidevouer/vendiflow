import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Role } from "@/lib/rbac";

/** Utilisateur connecté + première entreprise (sélecteur multi-entreprises : phase suivante). */
export async function getContext() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: m } = await supabase.from("memberships")
    .select("company_id, role, companies(name, currency)").eq("user_id", user.id).order("created_at").limit(1).maybeSingle();
  return { supabase, user, membership: m ? { companyId: m.company_id as string, role: m.role as Role,
    companyName: (m.companies as any)?.name as string, currency: (m.companies as any)?.currency as string } : null };
}
