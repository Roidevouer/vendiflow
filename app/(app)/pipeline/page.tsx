import { revalidatePath } from "next/cache";
import { requireRole, fail } from "@/lib/guard";
import { opportunitySchema, toMinor } from "@/lib/validation";
import { money } from "@/lib/format";
import { Flash, Empty } from "@/lib/ui";

async function create(fd: FormData) {
  "use server";
  const { supabase, membership } = await requireRole("sales", "/pipeline");
  const p = opportunitySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/pipeline", "Contact et titre obligatoires.");
  const { data: first } = await supabase.from("pipeline_stages").select("id").eq("position", 1).limit(1).single();
  const { error } = await supabase.from("opportunities").insert({ company_id: membership.companyId, contact_id: p.data!.contactId,
    stage_id: first!.id, title: p.data!.title, amount_minor: toMinor(p.data!.amount, membership.currency) });
  if (error) fail("/pipeline", "Création impossible.");
  revalidatePath("/pipeline");
}
async function move(fd: FormData) {
  "use server";
  const { supabase } = await requireRole("sales", "/pipeline");
  const { error } = await supabase.from("opportunities").update({ stage_id: String(fd.get("stage")) }).eq("id", String(fd.get("id")));
  if (error) fail("/pipeline", "Déplacement impossible.");
  revalidatePath("/pipeline");
}
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams; const { supabase, membership } = await requireRole("viewer");
  const [{ data: stages }, { data: opps }, { data: contacts }] = await Promise.all([
    supabase.from("pipeline_stages").select("id, name, kind").order("position"),
    supabase.from("opportunities").select("id, title, amount_minor, stage_id, contacts(full_name)"),
    supabase.from("contacts").select("id, full_name").is("archived_at", null).order("full_name")]);
  const canWrite = membership.role !== "viewer";
  return <div><h1 className="text-2xl font-semibold">Pipeline</h1><div className="mt-3"><Flash error={q.error} /></div>
    <div className="flex gap-3 overflow-x-auto pb-3">{stages?.map((s) => { const items = opps?.filter((o) => o.stage_id === s.id) ?? [];
      return <section key={s.id} aria-label={s.name} className="w-64 shrink-0 rounded-md border border-gray-200 bg-white p-3">
        <h2 className="text-sm font-semibold">{s.name} <span className="font-normal text-gray-500">({items.length})</span></h2>
        <ul className="mt-2 space-y-2">{items.map((o) => <li key={o.id} className="rounded border border-gray-200 p-2 text-sm">
          <p className="font-medium">{o.title}</p><p className="text-gray-600">{(o.contacts as any)?.full_name} · {money(o.amount_minor, membership.currency)}</p>
          {canWrite && <form action={move} className="mt-2 flex gap-1"><input type="hidden" name="id" value={o.id} />
            <select name="stage" defaultValue={s.id} className="field py-1" aria-label="Étape">{stages!.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><button className="btn px-2 py-1">OK</button></form>}
        </li>)}</ul>{!items.length && <p className="mt-2 text-xs text-gray-500">Aucune opportunité</p>}</section>; })}</div>
    {canWrite && (contacts?.length ? <form action={create} className="mt-4 grid gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <label className="text-sm">Contact<select className="field mt-1" name="contactId" required>{contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
      <label className="text-sm">Titre<input className="field mt-1" name="title" required /></label>
      <label className="text-sm">Montant estimé<input className="field mt-1" name="amount" type="number" min="0" step="any" defaultValue={0} /></label>
      <button className="btn self-end">Ajouter l'opportunité</button></form> : <Empty>Ajoutez d'abord un contact pour créer une opportunité.</Empty>)}
  </div>;
}
