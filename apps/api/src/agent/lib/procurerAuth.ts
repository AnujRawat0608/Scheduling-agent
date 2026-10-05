import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

// Reuse the supplier helpers: same bcrypt settings, one place to maintain.
// (Importing supplierAuth also guarantees JWT_SECRET exists, or startup fails.)
export { hashPassword, verifyPassword } from "./supplierAuth.js";

const JWT_SECRET = process.env.JWT_SECRET as string;

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export interface ProcurerClaims {
  procurerId: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      procurer?: ProcurerClaims;
    }
  }
}

export function signProcurerToken(c: ProcurerClaims): string {
  // The role claim is what separates buyer tokens from supplier tokens.
  return jwt.sign({ ...c, role: "procurer" }, JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
}

export function requireProcurerAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    const p = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as ProcurerClaims & { role?: string };
    if (p.role !== "procurer" || typeof p.procurerId !== "string") {
      return res.status(401).json({ error: "Not logged in" });
    }
    req.procurer = { procurerId: p.procurerId, email: p.email };
    next();
  } catch {
    res.status(401).json({ error: "Session expired or invalid" });
  }
}