import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { procurers } from "../db/procurersSchema.js";
import { isValidCountry } from "../lib/countries.js";
import {
  hashPassword,
  verifyPassword,
  DUMMY_HASH,
  signProcurerToken,
  requireProcurerAuth,
} from "../agent/lib/procurerAuth.js";

export const procurerAuthRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isUniqueViolation = (e: any) => e?.code === "23505" || e?.cause?.code === "23505";

// Never includes passwordHash.
const publicProcurer = (p: typeof procurers.$inferSelect) => ({
  id: p.id,
  email: p.email,
  companyName: p.companyName,
  country: p.country,
  contactName: p.contactName,
  phone: p.phone,
  gstNumber: p.gstNumber,
  address: p.address,
  city: p.city,
  state: p.state,
  pincode: p.pincode,
});

// 20 attempts per IP per 15 minutes on register and login.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

function readCredentials(body: any) {
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  return { email, password };
}

/** Trimmed text capped at `max` characters, or null when empty / not a string. */
function optionalText(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * POST /api/procurer-auth/register
 * `country` is required and must be one of the names in lib/countries.ts. It is the buyer's
 * DELIVERY DESTINATION for the route risk check. Company details are saved too (the earlier
 * version of this route only stored email and password).
 */
procurerAuthRouter.post("/register", authLimiter, async (req, res) => {
  try {
    const { email, password } = readCredentials(req.body);
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Password must be 8 to 72 characters" });
    }

    const companyName = optionalText(req.body?.companyName);
    if (!companyName) {
      return res.status(400).json({ error: "Company name is required" });
    }

    const country = req.body?.country;
    if (!isValidCountry(country)) {
      return res.status(400).json({ error: "Please select a valid country." });
    }

    const [procurer] = await db
      .insert(procurers)
      .values({
        email,
        passwordHash: await hashPassword(password),
        companyName,
        country,
        contactName: optionalText(req.body?.contactName),
        phone: optionalText(req.body?.phone, 40),
        gstNumber: optionalText(req.body?.gstNumber, 40),
        address: optionalText(req.body?.address, 300),
        city: optionalText(req.body?.city, 100),
        state: optionalText(req.body?.state, 100),
        pincode: optionalText(req.body?.pincode, 20),
      })
      .returning();

    res.status(201).json({
      procurer: publicProcurer(procurer),
      token: signProcurerToken({ procurerId: procurer.id, email: procurer.email }),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

procurerAuthRouter.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = readCredentials(req.body);
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [procurer] = await db.select().from(procurers).where(eq(procurers.email, email)).limit(1);

    // Always run one bcrypt compare, even for unknown emails.
    const ok = await verifyPassword(password, procurer?.passwordHash ?? DUMMY_HASH);
    if (!procurer || !ok) return res.status(401).json({ error: "Invalid email or password" });

    await db.update(procurers).set({ lastLoginAt: new Date() }).where(eq(procurers.id, procurer.id));

    res.json({
      procurer: publicProcurer(procurer),
      token: signProcurerToken({ procurerId: procurer.id, email: procurer.email }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

procurerAuthRouter.post("/logout", (_req, res) => res.status(204).send());

procurerAuthRouter.get("/me", requireProcurerAuth, async (req, res) => {
  const [procurer] = await db
    .select()
    .from(procurers)
    .where(eq(procurers.id, req.procurer!.procurerId))
    .limit(1);
  if (!procurer) return res.status(401).json({ error: "Session no longer valid" });
  res.json({ procurer: publicProcurer(procurer) });
});

/**
 * PATCH /api/procurer-auth/me
 * Lets an existing buyer (registered before country was collected) set or change their
 * country. Only `country` can be changed here.
 */
procurerAuthRouter.patch("/me", requireProcurerAuth, async (req, res) => {
  try {
    const country = req.body?.country;
    if (!isValidCountry(country)) {
      return res.status(400).json({ error: "Please select a valid country." });
    }

    const [procurer] = await db
      .update(procurers)
      .set({ country })
      .where(eq(procurers.id, req.procurer!.procurerId))
      .returning();

    if (!procurer) return res.status(401).json({ error: "Session no longer valid" });
    res.json({ procurer: publicProcurer(procurer) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});