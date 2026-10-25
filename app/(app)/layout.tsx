import Link from "next/link";
import { getContext } from "@/lib/session";
import { signOut } from "../(auth)/actions";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await getContext();
  return <div className="min-h-screen md:flex">
    <aside className="border-b border-gray-200 bg-white p-4 md:w-56 md:border-b-0 md:border-r">
      <p className="font-semibold text-brand-700">VendiFlow</p>
      {membership && <p className="mb-3 truncate text-xs text-gray-500">{membership.companyName}</p>}
      <nav aria-label="Navigation principale" className="flex gap-4 md:flex-col md:gap-2">
        <Link href="/dashboard" className="text-sm hover:text-brand-700">Tableau de bord</Link>
        <Link href="/contacts" className="text-sm hover:text-brand-700">Contacts</Link><Link href="/pipeline" className="text-sm hover:text-brand-700">Pipeline</Link><Link href="/produits" className="text-sm hover:text-brand-700">Produits</Link><Link href="/commandes" className="text-sm hover:text-brand-700">Commandes</Link><Link href="/membres" className="text-sm hover:text-brand-700">Membres</Link>
        <form action={signOut}><button className="text-sm text-gray-600 underline">Se déconnecter</button></form>
      </nav>
    </aside>
    <main className="flex-1 p-6">{children}</main>
  </div>;
}
