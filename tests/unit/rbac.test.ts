import { describe, it, expect } from "vitest";
import { hasRole, assertRole, ForbiddenError } from "../../lib/rbac";

describe("rbac", () => {
  it("respecte la hiérarchie", () => {
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("sales", "admin")).toBe(false);
    expect(hasRole(null, "viewer")).toBe(false);
  });
  it("assertRole lève ForbiddenError", () => {
    expect(() => assertRole("viewer", "sales")).toThrow(ForbiddenError);
  });
});
