import { revalidatePath } from "next/cache";
import { requireRole, fail } from "@/lib/guard";
import { productSchema, toMinor } from "@/lib/validation";
import { money } from "@/lib/format";
import { Flash, Empty, Th } from "@/lib/ui";

async function create(fd: FormData) {
  "use server";
  const { supabase, membership } = await requireRole("sales", "/produits");
  const p = productSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/produits", "Référence, nom et prix valides obligatoires.");
  const { error } = await supabase.from("products").insert({ company_id: membership.companyId, reference: p.data!.reference, name: p.data!.name, price_minor: toMinor(p.data!.price, membership.currency) });
  if (error) fail("/produits", error.code === "23505" ? "Cette référence existe déjà." : "Création impossible.");
  revalidatePath("/produits");
}
async function archive(fd: FormData) {
  "use server";
  const { supabase } = await requireRole("sales", "/produits");
  await supabase.from("products").update({ archived_at: new Date().toISOString() }).eq("id", String(fd.get("id")));
  revalidatePath("/produits");
}
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams; const { supabase, membership } = await requireRole("viewer");
  const { data } = await supabase.from("products").select("id, reference, name, price_minor").is("archived_at", null).order("name");
  const canWrite = membership.role !== "viewer";
  return <div className="max-w-3xl"><h1 className="text-2xl font-semibold">Produits et services</h1><div className="mt-3"><Flash error={q.error} /></div>
    {data?.length ? <table className="w-full rounded-md border border-gray-200 bg-white text-sm"><thead><tr><Th>Référence</Th><Th>Nom</Th><Th>Prix</Th><Th>{""}</Th></tr></thead><tbody className="divide-y divide-gray-100">
      {data.map((p) => <tr key={p.id}><td className="px-4 py-2">{p.reference}</td><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">{money(p.price_minor, membership.currency)}</td>
        <td className="px-4 py-2 text-right">{canWrite && <form action={archive}><input type="hidden" name="id" value={p.id} /><button className="text-gray-600 underline">Archiver</button></form>}</td></tr>)}</tbody></table>
      : <Empty>Votre catalogue est vide. Ajoutez un produit ou un service pour pouvoir créer des commandes.</Empty>}
    {canWrite && <form action={create} className="mt-6 grid gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-4">
      <label className="text-sm">Référence<input className="field mt-1" name="reference" required /></label>
      <label className="text-sm">Nom<input className="field mt-1" name="name" required /></label>
      <label className="text-sm">Prix ({membership.currency})<input className="field mt-1" name="price" type="number" min="0" step="any" required /></label>
      <button className="btn self-end">Ajouter</button></form>}
  </div>;
}
