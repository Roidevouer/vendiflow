import "./globals.css";
export const metadata = { title: "VendiFlow", description: "Gestion commerciale et WhatsApp pour les PME" };
export default function Root({ children }: { children: React.ReactNode }) {
  return <html lang="fr"><body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body></html>;
}
