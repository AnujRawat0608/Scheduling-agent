import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export const SUPPLIER_SESSION_COOKIE = "supplier_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

type SupplierTokenPayload = {
  supplierId: string;
  email: string;
};

export function signSupplierToken(payload: SupplierTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: "7d" });
}

export function verifySupplierToken(token: string): SupplierTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as SupplierTokenPayload;
  } catch {
    return null;
  }
}

export function setSupplierSessionCookie(res: Response, token: string) {
  res.cookie(SUPPLIER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSupplierSessionCookie(res: Response) {
  res.clearCookie(SUPPLIER_SESSION_COOKIE);
}

// Extend Express's Request type so `req.supplier` is recognized.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      supplier?: SupplierTokenPayload;
    }
  }
}

/**
 * Middleware for routes that require a logged-in supplier. On success,
 * attaches `req.supplier = { supplierId, email }`. On failure, responds
 * 401 and does not call next().
 */
export function requireSupplierAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SUPPLIER_SESSION_COOKIE];
  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const payload = verifySupplierToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Session expired or invalid" });
  }

  req.supplier = payload;
  next();
}