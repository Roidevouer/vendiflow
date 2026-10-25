import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { hasRole, type Role } from "@/lib/rbac";

/** Contexte + entreprise obligatoire + rôle minimum ; sinon redirection explicite. */
export async function requireRole(min: Role, back = "/dashboard") {
  const ctx = await getContext();
  if (!ctx.membership) redirect("/onboarding");
  if (!hasRole(ctx.membership.role, min)) redirect(`${back}?error=${encodeURIComponent("Votre rôle ne permet pas cette action.")}`);
  return { ...ctx, membership: ctx.membership };
}
export const fail = (path: string, msg: string): never => redirect(`${path}?error=${encodeURIComponent(msg)}`);
