import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12, "12 caractères minimum").max(128),
});
export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  currency: z.enum(["XOF", "EUR"]).default("XOF"),
  timezone: z.string().default("Africa/Abidjan"),
});
export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(["admin", "sales", "viewer"]),
});

const opt = <T extends z.ZodTypeAny>(s: T) => z.union([z.literal("").transform(() => undefined), s]).optional();
export const contactSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  phone: opt(z.string().trim().regex(/^\+[1-9]\d{6,14}$/, "Numéro au format international, ex. +2250700000000")),
  email: opt(z.string().trim().toLowerCase().email()),
  source: opt(z.string().trim().max(60)),
});
export const productSchema = z.object({
  reference: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(160),
  price: z.coerce.number().min(0).max(1e9),
});
export const opportunitySchema = z.object({
  contactId: z.string().uuid(), title: z.string().trim().min(1).max(160), amount: z.coerce.number().min(0).default(0),
});
export const orderSchema = z.object({
  contactId: z.string().uuid(), productId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(100000), discount: z.coerce.number().min(0).default(0),
});
export const paymentSchema = z.object({ orderId: z.string().uuid(), amount: z.coerce.number().gt(0) });
/** FCFA : entier ; EUR : centimes. */
export const toMinor = (v: number, cur: string) => Math.round(cur === "EUR" ? v * 100 : v);
