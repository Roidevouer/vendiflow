import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { createCompanySchema } from "@/lib/validation";

async function create(fd: FormData) {
  "use server";
  const p = createCompanySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/onboarding?error=" + encodeURIComponent("Nom d'entreprise invalide (2 à 120 caractères)."));
  const { supabase } = await getContext();
  const { error } = await supabase.rpc("create_company", { p_name: p.data.name, p_currency: p.data.currency, p_timezone: p.data.timezone });
  if (error) redirect("/onboarding?error=" + encodeURIComponent("Création impossible. Réessayez."));
  redirect("/dashboard");
}
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ membership }, q] = [await getContext(), await searchParams];
  if (membership) redirect("/dashboard");
  return <div className="max-w-sm"><h1 className="text-2xl font-semibold">Configurer votre entreprise</h1>
    {q.error && <p role="alert" className="alert-error mt-3">{q.error}</p>}
    <form action={create} className="mt-4 flex flex-col gap-3">
      <label className="text-sm">Nom de l'entreprise<input className="field mt-1" name="name" required minLength={2} /></label>
      <label className="text-sm">Devise<select className="field mt-1" name="currency"><option value="XOF">FCFA (XOF)</option><option value="EUR">Euro (EUR)</option></select></label>
      <input type="hidden" name="timezone" value="Africa/Abidjan" />
      <button className="btn" type="submit">Créer l'entreprise</button>
    </form></div>;
}
