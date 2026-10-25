export const ROLES = ["viewer", "sales", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const roleRank = (r: Role) => ROLES.indexOf(r) + 1;
export const hasRole = (current: Role | null | undefined, min: Role) =>
  !!current && roleRank(current) >= roleRank(min);

export class ForbiddenError extends Error {
  constructor() { super("forbidden"); this.name = "ForbiddenError"; }
}
/** À appeler au début de chaque Server Action / Route Handler (en plus de la RLS). */
export function assertRole(current: Role | null | undefined, min: Role): asserts current is Role {
  if (!hasRole(current, min)) throw new ForbiddenError();
}
