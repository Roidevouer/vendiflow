"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/validation";
import { z } from "zod";

const site = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const back = (path: string, kind: "error" | "info", msg: string): never => redirect(`${path}?${kind}=${encodeURIComponent(msg)}`);

export async function signUp(fd: FormData) {
  const p = signUpSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) back("/inscription", "error", p.error.issues[0].message);
  const { fullName, email, password } = p.data!;
  const sb = await supabaseServer();
  const { error } = await sb.auth.signUp({ email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: `${site()}/auth/callback?next=/onboarding` } });
  if (error) back("/inscription", "error", "Inscription impossible. Vérifiez vos informations ou réessayez plus tard.");
  back("/connexion", "info", "Compte créé. Ouvrez l'e-mail de confirmation pour activer votre accès.");
}

export async function signIn(fd: FormData) {
  const p = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).safeParse(Object.fromEntries(fd));
  if (!p.success) back("/connexion", "error", "E-mail ou mot de passe invalide.");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword(p.data!);
  if (error) back("/connexion", "error", "E-mail ou mot de passe incorrect, ou compte non confirmé.");
  redirect("/dashboard");
}

export async function resetPassword(fd: FormData) {
  const p = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (p.success) { const sb = await supabaseServer(); await sb.auth.resetPasswordForEmail(p.data, { redirectTo: `${site()}/auth/callback?next=/dashboard` }); }
  // Réponse identique dans tous les cas : ne révèle pas si le compte existe.
  back("/mot-de-passe-oublie", "info", "Si ce compte existe, un e-mail de réinitialisation vient d'être envoyé.");
}

export async function signOut() {
  const sb = await supabaseServer(); await sb.auth.signOut(); redirect("/connexion");
}
