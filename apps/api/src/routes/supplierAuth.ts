import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { suppliers } from "../db/suppliersSchema.js";
import {
  hashPassword,
  verifyPassword,
  signSupplierToken,
  setSupplierSessionCookie,
  clearSupplierSessionCookie,
  requireSupplierAuth,
} from "../agent/lib/supplierAuth.js";

export const supplierAuthRouter = Router();

function publicSupplier(row: typeof suppliers.$inferSelect) {
  // Never send passwordHash back to the client.
  const { passwordHash, ...rest } = row;
  return rest;
}

/**
 * POST /api/supplier-auth/register
 * Creates a supplier account with their business details, then logs them
 * in immediately. Product listings are added separately from the supply
 * chain catalog page after registration — not part of this flow.
 */
supplierAuthRouter.post("/register", async (req, res) => {
  try {
    const {
      email,
      password,
      businessName,
      contactName,
      phone,
      gstNumber,
      address,
      city,
      state,
      pincode,
    } = req.body ?? {};

    if (!email || !password || !businessName) {
      return res.status(400).json({ error: "email, password, and businessName are required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const [existing] = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.email, email))
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);

    const [supplier] = await db
      .insert(suppliers)
      .values({
        email,
        passwordHash,
        businessName,
        contactName: contactName ?? null,
        phone: phone ?? null,
        gstNumber: gstNumber ?? null,
        address: address ?? null,
        city: city ?? null,
        state: state ?? null,
        pincode: pincode ?? null,
      })
      .returning();

    const token = signSupplierToken({ supplierId: supplier.id, email: supplier.email });
    setSupplierSessionCookie(res, token);

    res.status(201).json({
      supplier: publicSupplier(supplier),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * POST /api/supplier-auth/login
 */
supplierAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.email, email))
      .limit(1);

    // Deliberately generic message on both "no such user" and "wrong
    // password" so we don't leak which emails are registered.
    if (!supplier) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await verifyPassword(password, supplier.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signSupplierToken({ supplierId: supplier.id, email: supplier.email });
    setSupplierSessionCookie(res, token);

    res.json({ supplier: publicSupplier(supplier) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

/**
 * POST /api/supplier-auth/logout
 */
supplierAuthRouter.post("/logout", (_req, res) => {
  clearSupplierSessionCookie(res);
  res.status(204).send();
});

/**
 * GET /api/supplier-auth/me
 * Lets the frontend check "am I logged in" on page load.
 */
supplierAuthRouter.get("/me", requireSupplierAuth, async (req, res) => {
  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, req.supplier!.supplierId))
    .limit(1);

  if (!supplier) {
    return res.status(401).json({ error: "Session no longer valid" });
  }

  res.json({ supplier: publicSupplier(supplier) });
});