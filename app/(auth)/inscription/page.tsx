import { AuthShell, L } from "@/lib/auth-ui";
import { signUp } from "../actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  return <AuthShell title="Créer votre compte" error={q.error}>
    <form action={signUp} className="flex flex-col gap-3">
      <label className="text-sm">Nom complet<input className="field mt-1" name="fullName" autoComplete="name" required minLength={2} /></label>
      <label className="text-sm">Adresse e-mail<input className="field mt-1" name="email" type="email" autoComplete="email" required /></label>
      <label className="text-sm">Mot de passe (12 caractères minimum)<input className="field mt-1" name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
      <button className="btn" type="submit">Créer mon compte</button>
    </form>
    <L href="/connexion">J'ai déjà un compte</L>
  </AuthShell>;
}
