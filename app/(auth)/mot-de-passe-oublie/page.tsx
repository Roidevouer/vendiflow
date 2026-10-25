import { AuthShell, L } from "@/lib/auth-ui";
import { resetPassword } from "../actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ info?: string }> }) {
  const q = await searchParams;
  return <AuthShell title="Réinitialiser le mot de passe" info={q.info}>
    <form action={resetPassword} className="flex flex-col gap-3">
      <label className="text-sm">Adresse e-mail<input className="field mt-1" name="email" type="email" required /></label>
      <button className="btn" type="submit">Envoyer le lien</button>
    </form>
    <L href="/connexion">Retour à la connexion</L>
  </AuthShell>;
}
