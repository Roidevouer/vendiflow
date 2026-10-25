import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

async function accept(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("accept_invitation", { p_token: String(fd.get("token") ?? "") });
  if (error) redirect("/invitation?error=" + encodeURIComponent("Invitation invalide, expirée ou destinée à une autre adresse e-mail."));
  redirect("/dashboard");
}
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const q = await searchParams;
  return <main className="mx-auto max-w-sm p-6"><h1 className="text-2xl font-semibold">Rejoindre une entreprise</h1>
    {q.error && <p role="alert" className="alert-error mt-3">{q.error}</p>}
    {q.token ? <form action={accept} className="mt-4"><input type="hidden" name="token" value={q.token} /><button className="btn" type="submit">Accepter l'invitation</button></form>
      : <p className="mt-3 text-gray-600">Aucun jeton d'invitation dans ce lien.</p>}
  </main>;
}
