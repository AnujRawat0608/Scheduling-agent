import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { admins } from "../db/adminSchema.js";
import { hashPassword, verifyPassword } from "../agent/lib/supplierAuth.js";
import { signAdminToken, requireAdminAuth } from "../agent/lib/adminAuth.js";

export const adminAuthRouter = Router();

function publicAdmin(row: typeof admins.$inferSelect) {
  const { passwordHash, ...rest } = row;
  return rest;
}

/**
 * POST /api/admin-auth/login
 * No register route — admin accounts are created via seed script
 * (src/scripts/seedAdmin.ts) or later by an existing admin, never
 * through public self-signup.
 */
adminAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);

    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordMatches = await verifyPassword(password, admin.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = signAdminToken({ adminId: admin.id, email: admin.email, role: admin.role });

    res.json({ admin: publicAdmin(admin), token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String((err as Error)?.message ?? err) });
  }
});

adminAuthRouter.post("/logout", (_req, res) => {
  res.status(204).send();
});

adminAuthRouter.get("/me", requireAdminAuth, async (req, res) => {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.id, req.admin!.adminId))
    .limit(1);

  if (!admin) {
    return res.status(401).json({ error: "Session no longer valid" });
  }

  res.json({ admin: publicAdmin(admin) });
});