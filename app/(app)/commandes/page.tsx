import { revalidatePath } from "next/cache";
import { requireRole, fail } from "@/lib/guard";
import { orderSchema, paymentSchema, toMinor } from "@/lib/validation";
import { money } from "@/lib/format";
import { Flash, Empty, Th } from "@/lib/ui";

async function create(fd: FormData) {
  "use server";
  const { supabase, membership } = await requireRole("sales", "/commandes");
  const p = orderSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/commandes", "Client, produit et quantité valides obligatoires.");
  const d = p.data!;
  const { data: o, error } = await supabase.from("orders").insert({ company_id: membership.companyId, contact_id: d.contactId, discount_minor: toMinor(d.discount, membership.currency) }).select("id").single();
  if (error || !o) return fail("/commandes", "Création impossible.");
  const { error: e2 } = await supabase.from("order_items").insert({ company_id: membership.companyId, order_id: o.id, product_id: d.productId, quantity: d.quantity });
  if (e2) { await supabase.from("orders").delete().eq("id", o.id); fail("/commandes", "Produit indisponible ou invalide."); }
  revalidatePath("/commandes");
}
async function setStatus(fd: FormData) {
  "use server";
  const { supabase } = await requireRole("sales", "/commandes");
  const status = String(fd.get("status"));
  if (!["confirmed", "fulfilled", "cancelled"].includes(status)) fail("/commandes", "Statut invalide.");
  await supabase.from("orders").update({ status }).eq("id", String(fd.get("id")));
  revalidatePath("/commandes");
}
async function pay(fd: FormData) {
  "use server";
  const { supabase, membership } = await requireRole("sales", "/commandes");
  const p = paymentSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) fail("/commandes", "Montant invalide.");
  const amount = toMinor(p.data!.amount, membership.currency);
  const { data: o } = await supabase.from("orders").select("total_minor, status, order_payments(amount_minor, status)").eq("id", p.data!.orderId).single();
  const paid = (o?.order_payments ?? []).filter((x: any) => x.status === "confirmed").reduce((s: number, x: any) => s + Number(x.amount_minor), 0);
  if (!o || o.status === "cancelled" || amount + paid > Number(o.total_minor)) fail("/commandes", "Le paiement dépasse le solde dû ou la commande est annulée.");
  const { error } = await supabase.from("order_payments").insert({ company_id: membership.companyId, order_id: p.data!.orderId, amount_minor: amount, status: "confirmed", method: "manuel", paid_at: new Date().toISOString() });
  if (error) fail("/commandes", "Enregistrement impossible.");
  revalidatePath("/commandes");
}
const LABEL: Record<string, string> = { draft: "Brouillon", confirmed: "Confirmée", fulfilled: "Livrée", cancelled: "Annulée" };
export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams; const { supabase, membership } = await requireRole("viewer"); const cur = membership.currency;
  const [{ data: orders }, { data: contacts }, { data: products }] = await Promise.all([
    supabase.from("orders").select("id, number, status, total_minor, contacts(full_name), order_payments(amount_minor, status)").order("number", { ascending: false }).limit(100),
    supabase.from("contacts").select("id, full_name").is("archived_at", null).order("full_name"),
    supabase.from("products").select("id, name, price_minor").is("archived_at", null).eq("available", true).order("name")]);
  const canWrite = membership.role !== "viewer";
  return <div className="max-w-4xl"><h1 className="text-2xl font-semibold">Commandes</h1><div className="mt-3"><Flash error={q.error} /></div>
    {orders?.length ? <table className="w-full rounded-md border border-gray-200 bg-white text-sm"><thead><tr><Th>N°</Th><Th>Client</Th><Th>Statut</Th><Th>Total</Th><Th>Encaissé</Th><Th>{""}</Th></tr></thead><tbody className="divide-y divide-gray-100">
      {orders.map((o) => { const paid = (o.order_payments as any[]).filter((x) => x.status === "confirmed").reduce((s, x) => s + Number(x.amount_minor), 0);
        return <tr key={o.id}><td className="px-4 py-2">{o.number}</td><td className="px-4 py-2">{(o.contacts as any)?.full_name}</td><td className="px-4 py-2">{LABEL[o.status]}</td>
          <td className="px-4 py-2">{money(o.total_minor, cur)}</td><td className="px-4 py-2">{money(paid, cur)}</td>
          <td className="px-4 py-2">{canWrite && o.status !== "cancelled" && <div className="flex flex-wrap gap-2">
            {o.status === "draft" && <form action={setStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="confirmed" /><button className="underline">Confirmer</button></form>}
            {o.status === "confirmed" && <form action={setStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="fulfilled" /><button className="underline">Marquer livrée</button></form>}
            <form action={setStatus}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="status" value="cancelled" /><button className="underline">Annuler</button></form>
            {paid < Number(o.total_minor) && <form action={pay} className="flex gap-1"><input type="hidden" name="orderId" value={o.id} /><input className="field w-24 py-1" name="amount" type="number" min="1" step="any" aria-label="Montant reçu" required /><button className="underline">Paiement reçu</button></form>}</div>}</td></tr>; })}</tbody></table>
      : <Empty>Aucune commande pour le moment.</Empty>}
    {canWrite && (contacts?.length && products?.length ? <form action={create} className="mt-6 grid gap-3 rounded-md border border-gray-200 bg-white p-4 sm:grid-cols-5">
      <label className="text-sm">Client<select className="field mt-1" name="contactId">{contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select></label>
      <label className="text-sm">Produit<select className="field mt-1" name="productId">{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({money(p.price_minor, cur)})</option>)}</select></label>
      <label className="text-sm">Quantité<input className="field mt-1" name="quantity" type="number" min="1" defaultValue={1} /></label>
      <label className="text-sm">Remise<input className="field mt-1" name="discount" type="number" min="0" step="any" defaultValue={0} /></label>
      <button className="btn self-end">Créer la commande</button></form> : <div className="mt-6"><Empty>Il faut au moins un contact et un produit pour créer une commande.</Empty></div>)}
  </div>;
}
