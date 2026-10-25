import { AuthShell, L } from "@/lib/auth-ui";
import { signIn } from "../actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const q = await searchParams;
  return <AuthShell title="Connexion" error={q.error} info={q.info}>
    <form action={signIn} className="flex flex-col gap-3">
      <label className="text-sm">Adresse e-mail<input className="field mt-1" name="email" type="email" autoComplete="email" required /></label>
      <label className="text-sm">Mot de passe<input className="field mt-1" name="password" type="password" autoComplete="current-password" required /></label>
      <button className="btn" type="submit">Se connecter</button>
    </form>
    <div className="flex justify-between"><L href="/inscription">Créer un compte</L><L href="/mot-de-passe-oublie">Mot de passe oublié</L></div>
  </AuthShell>;
}
