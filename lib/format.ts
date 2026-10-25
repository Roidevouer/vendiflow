export function money(minor: number | string | null | undefined, cur = "XOF") {
  const n = Number(minor ?? 0) / (cur === "EUR" ? 100 : 1);
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur, maximumFractionDigits: cur === "EUR" ? 2 : 0 }).format(n);
}
