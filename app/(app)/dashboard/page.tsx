import { requireRole } from "@/lib/guard";
import { money } from "@/lib/format";
import { Flash } from "@/lib/ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams; const { supabase, membership } = await requireRole("viewer"); const cur = membership.currency;
  const [rev, contacts, opps, orders] = await Promise.all([
    supabase.from("company_revenue").select("ordered_minor, collected_minor").eq("company_id", membership.companyId).single(),
    supabase.from("contacts").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("opportunities").select("closed_at, pipeline_stages(kind)"),
    supabase.from("orders").select("id", { count: "exact", head: true }).neq("status", "cancelled")]);
  const o = opps.data ?? []; const kind = (x: any) => x.pipeline_stages?.kind;
  const won = o.filter((x) => kind(x) === "won").length, lost = o.filter((x) => kind(x) === "lost").length, open = o.filter((x) => kind(x) === "open").length;
  const conv = won + lost > 0 ? `${Math.round((won / (won + lost)) * 100)} %` : "—";
  const kpis = [
    { l: "Contacts actifs", v: String(contacts.count ?? 0), d: "Contacts non archivés." },
    { l: "Opportunités ouvertes", v: String(open), d: "Opportunités dans une étape de type « ouvert »." },
    { l: "Taux de conversion", v: conv, d: "Gagnées ÷ (gagnées + perdues). Affiché seulement quand au moins une opportunité est clôturée." },
    { l: "Commandes", v: String(orders.count ?? 0), d: "Commandes non annulées." },
    { l: "Montant commandé", v: money(rev.data?.ordered_minor, cur), d: "Somme des totaux de commandes non annulées." },
    { l: "Chiffre d'affaires encaissé", v: money(rev.data?.collected_minor, cur), d: "Somme des paiements confirmés uniquement." }];
  return <div className="max-w-4xl"><h1 className="text-2xl font-semibold">{membership.companyName}</h1><div className="mt-3"><Flash error={q.error} /></div>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{kpis.map((k) => <div key={k.l} className="rounded-md border border-gray-200 bg-white p-4">
      <dt className="text-sm text-gray-600">{k.l}</dt><dd className="mt-1 text-2xl font-semibold text-brand-900">{k.v}</dd><p className="mt-1 text-xs text-gray-500">{k.d}</p></div>)}</dl></div>;
}
