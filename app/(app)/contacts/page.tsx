import { revalidatePath } from "next/cache";
import { requireRole, fail } from "@/lib/guard";
import { contactSchema } from "@/lib/validation";
import { Flash, Empty, Th } from "@/lib/ui";

async function create(fd: FormData) {
  "use server";
  const { supabase, membership } = await requireRole("sales", "/contacts");
  const p = contactSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/contacts", p.error.issues[0].message);
  const d = p.data!;
  const { error } = await supabase.from("contacts").insert({ company_id: membership.companyId, full_name: d.fullName, phone: d.phone, email: d.email, source: d.source });
  if (error) fail("/contacts", error.code === "23505" ? "Ce numéro existe déjà dans vos contacts." : "Création impossible.");
  revalidatePath("/contacts");
}
async function archive(fd: FormData) {
  "use server";
  const { supabase } = await requireRole("sales", "/contacts");
  await supabase.from("contacts").update({ archived_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/contacts");
}
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; q?: string }> }) {
  const q = await searchParams; const { supabase, membership } = await requireRole("viewer");
  let query = supabase.from("contacts").select("id, full_name, phone, email, source").is("archived_at", null).order("created_at", { ascending: false }).limit(200);
  if (q.q) query = query.ilike("full_name", `%${q.q.replace(/[%_,]/g, "")}%`);
  const { data } = await query; const canWrite = membership.role !== "viewer";
  return <div className="max-w-4xl"><h1 className="text-2xl font-semibold">Contacts</h1><div className="mt-3"><Flash error={q.error} /></div>
    <form className="mb-4 flex gap-2"><input className="field" name="q" defaultValue={q.q} placeholder="Rechercher par nom" aria-label="Rechercher" /><button className="btn">Rechercher</button></form>
    {data?.length ? <table className="w-full rounded-md border border-gray-200 bg-white text-sm"><thead><tr><Th>Nom</Th><Th>Téléphone</Th><Th>Source</Th><Th>{""}</Th></tr></thead><tbody className="divide-y divide-gray-100">
      {data.map((c) => <tr key={c.id}><td className="px-4 py-2">{c.full_name}</td><td className="px-4 py-2">{c.phone ?? "—"}</td><td className="px-4 py-2">{c.source ?? "—"}</td>
        <td className="px-4 py-2 text-right">{canWrite && <form action={archive}><input type="hidden" name="id" value={c.id} /><button className="text-gray-600 underline">Archiver</button></form>}</td></tr>)}</tbody></table>
      : <Empty>Aucun contact. Ajoutez votre premier contact ci-dessous.</Empty>}
    {canWrite && <form action={create} className="mt-6 grid gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <label className="text-sm">Nom<input className="field mt-1" name="fullName" required /></label>
      <label className="text-sm">Téléphone<input className="field mt-1" name="phone" placeholder="+2250700000000" /></label>
      <label className="text-sm">E-mail<input className="field mt-1" name="email" type="email" /></label>
      <label className="text-sm">Source<input className="field mt-1" name="source" placeholder="WhatsApp, salon…" /></label>
      <button className="btn sm:col-span-4 sm:justify-self-start">Ajouter le contact</button></form>}
  </div>;
}
