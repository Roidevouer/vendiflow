import Link from "next/link";
export default function NotFound() {
  return <main className="mx-auto max-w-md p-10 text-center"><h1 className="text-2xl font-semibold">Page introuvable</h1>
    <p className="mt-2 text-gray-600">Cette adresse n'existe pas ou a été déplacée.</p>
    <Link className="btn mt-6" href="/dashboard">Retour au tableau de bord</Link></main>;
}
