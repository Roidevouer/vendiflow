import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { getContext } from "@/lib/session";
import { hasRole } from "@/lib/rbac";
import { inviteSchema } from "@/lib/validation";

async function invite(fd: FormData) {
  "use server";
  const { supabase, user, membership } = await getContext();
  if (!membership || !hasRole(membership.role, "admin")) redirect("/membres?error=" + encodeURIComponent("Action réservée aux administrateurs."));
  const p = inviteSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/membres?error=" + encodeURIComponent("E-mail ou rôle invalide."));
  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("invitations").insert({ company_id: membership.companyId, email: p.data.email,
    role: p.data.role, token_hash: createHash("sha256").update(token).digest("hex"), invited_by: user.id });
  if (error) redirect("/membres?error=" + encodeURIComponent("Invitation impossible."));
  const link = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/invitation?token=${token}`;
  redirect("/membres?link=" + encodeURIComponent(link));
}

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; link?: string }> }) {
  const [{ supabase, membership }, q] = [await getContext(), await searchParams];
  if (!membership) redirect("/onboarding");
  const { data: members } = await supabase.from("memberships").select("user_id, role").eq("company_id", membership.companyId);
  const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", (members ?? []).map((m) => m.user_id));
  const name = (id: string) => profiles?.find((p) => p.id === id)?.full_name || "Sans nom";
  const canInvite = hasRole(membership.role, "admin");
  return <div className="max-w-2xl"><h1 className="text-2xl font-semibold">Membres</h1>
    {q.error && <p role="alert" className="alert-error mt-3">{q.error}</p>}
    {q.link && <p role="status" className="alert-info mt-3 break-all">L'envoi d'e-mails n'est pas configuré : transmettez ce lien à la personne invitée (valable 7 jours, usage unique) : {q.link}</p>}
    <ul className="mt-4 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
      {(members ?? []).map((m) => <li key={m.user_id} className="flex justify-between px-4 py-3 text-sm"><span>{name(m.user_id)}</span><span className="text-gray-600">{m.role}</span></li>)}
    </ul>
    {canInvite ? <form action={invite} className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-sm">E-mail<input className="field mt-1" name="email" type="email" required /></label>
      <label className="text-sm">Rôle<select className="field mt-1" name="role"><option value="sales">Commercial</option><option value="admin">Administrateur</option><option value="viewer">Lecture seule</option></select></label>
      <button className="btn" type="submit">Inviter</button>
    </form> : <p className="mt-6 text-sm text-gray-600">Seuls les administrateurs peuvent inviter des membres.</p>}
  </div>;
}
