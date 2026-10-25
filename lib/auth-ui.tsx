import Link from "next/link";
export function AuthShell({ title, error, info, children }: { title: string; error?: string; info?: string; children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
    <p className="text-lg font-semibold text-brand-700">VendiFlow</p>
    <h1 className="text-2xl font-semibold">{title}</h1>
    {error && <p role="alert" className="alert-error">{error}</p>}
    {info && <p role="status" className="alert-info">{info}</p>}
    {children}
  </main>;
}
export const L = ({ href, children }: { href: string; children: React.ReactNode }) =>
  <Link href={href} className="text-sm text-brand-700 underline">{children}</Link>;
